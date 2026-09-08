import io
import logging
import os
import uuid

import cloudinary
import cloudinary.uploader
import requests
from django.core.exceptions import ValidationError
from django.core.files.base import File
from django.core.files.storage import Storage
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

BUCKET_NAME = 'site-content'
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 Mo — pre-compression, checked on the raw upload
ALLOWED_CONTENT_TYPES = {'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'}
# Uploaded screenshots/photos routinely arrive at several megabytes and
# full camera resolution — nothing on this site is ever displayed larger
# than this, and serving the original made every page agonizingly slow.
MAX_IMAGE_DIMENSION = 1920
# Formats Pillow would silently mangle if we tried to recompress them —
# SVG isn't a raster format at all, GIF loses its animation to a single
# frame. Both pass through untouched.
PASSTHROUGH_CONTENT_TYPES = {'image/svg+xml', 'image/gif'}

MAX_VIDEO_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 Mo — short demo clips only, not full-length video
ALLOWED_VIDEO_CONTENT_TYPES = {'video/mp4', 'video/webm', 'video/quicktime'}

MAX_FILE_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 Mo — matches the chat-attachment cap from the (now unused) storage.rules
# Pièces jointes chat — documents/images usuels uniquement. Pas d'exécutables,
# scripts, HTML (vecteur XSS/malware si le lien Cloudinary est cliqué par un
# collègue qui fait confiance au domaine). Étendre à la demande plutôt que
# l'inverse si un usage légitime bloqué est signalé.
ALLOWED_CHAT_ATTACHMENT_TYPES = {
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'application/zip',
}

_bucket_ensured = False

# Les appels Supabase passaient par les fonctions de module `requests.*`, qui
# ouvrent une connexion neuve a chaque fois : DNS, TCP et TLS repayes par
# requete. Une Session reutilise la connexion keep-alive, ce qui compte
# d'autant plus que signer une URL est un aller-retour par piece affichee.
_session = requests.Session()


def _supabase_config() -> tuple[str, str]:
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        raise RuntimeError('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ne sont pas configurées.')
    return url.rstrip('/'), key


def _ensure_bucket() -> None:
    """Idempotent, once per process — creates the public bucket if it
    doesn't exist yet. Public: these are marketing-site assets (partner
    logos, team photos) meant to be served directly to site visitors, same
    trust level as a static image in the frontend repo."""
    global _bucket_ensured
    if _bucket_ensured:
        return
    url, key = _supabase_config()
    headers = {'Authorization': f'Bearer {key}', 'apikey': key}
    response = _session.post(
        f'{url}/storage/v1/bucket',
        json={'id': BUCKET_NAME, 'name': BUCKET_NAME, 'public': True},
        headers=headers, timeout=10,
    )
    if response.status_code not in (200, 201) and 'already exists' not in response.text:
        logger.warning('Could not ensure Supabase bucket %s: %s', BUCKET_NAME, response.text)
    _bucket_ensured = True


def _resize_and_compress(file) -> tuple[bytes, str, str]:
    """Downscales to MAX_IMAGE_DIMENSION and recompresses. Images with
    transparency stay PNG (optimized); everything else becomes JPEG, by
    far the biggest win on typical photo/screenshot uploads."""
    try:
        image = Image.open(file)
        image = ImageOps.exif_transpose(image)  # respect the camera's rotation
    except Exception as exc:
        raise ValidationError(f'Image invalide ou corrompue : {exc}')

    has_alpha = image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info)

    if image.width > MAX_IMAGE_DIMENSION or image.height > MAX_IMAGE_DIMENSION:
        image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.LANCZOS)

    buffer = io.BytesIO()
    if has_alpha:
        image.save(buffer, format='PNG', optimize=True)
        content_type, extension = 'image/png', '.png'
    else:
        image.convert('RGB').save(buffer, format='JPEG', quality=82, optimize=True)
        content_type, extension = 'image/jpeg', '.jpg'
    return buffer.getvalue(), content_type, extension


def _cloudinary_configure() -> None:
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME')
    api_key = os.environ.get('CLOUDINARY_API_KEY')
    api_secret = os.environ.get('CLOUDINARY_API_SECRET')
    if not all([cloud_name, api_key, api_secret]):
        raise RuntimeError('CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET ne sont pas configurées.')
    cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True)


def _upload_to_cloudinary(data: bytes, folder: str) -> str:
    """Uploads to Cloudinary, returns its public (secure) URL. Kept separate
    from Supabase's _upload_bytes — user-driven traffic (avatars, chat
    attachments) is deliberately routed here instead, since the Supabase
    project is already over its free-tier egress quota. resource_type='auto'
    lets Cloudinary route images/videos/arbitrary files correctly without
    us tracking the distinction here."""
    _cloudinary_configure()
    try:
        result = cloudinary.uploader.upload(
            io.BytesIO(data), folder=folder, public_id=str(uuid.uuid4()), resource_type='auto',
        )
    except Exception as exc:
        raise RuntimeError(f"Échec de l'upload vers Cloudinary : {exc}")
    return result['secure_url']


def upload_avatar(file) -> str:
    """Uploads a profile photo to Cloudinary, returns its public URL.
    Same validation/resize pipeline as upload_image (see ALLOWED_CONTENT_TYPES,
    _resize_and_compress) — only the destination differs."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError(f'Type de fichier non autorisé : {file.content_type}.')
    if file.size > MAX_UPLOAD_SIZE:
        raise ValidationError('Le fichier dépasse la taille maximale autorisée (5 Mo).')

    if file.content_type in PASSTHROUGH_CONTENT_TYPES:
        return _upload_to_cloudinary(file.read(), 'avatars')

    data, _content_type, _extension = _resize_and_compress(file)
    return _upload_to_cloudinary(data, 'avatars')


def upload_image(file, folder: str) -> str:
    """Uploads an image to Supabase Storage, returns its public URL.
    `file` is a Django UploadedFile (request.FILES['file']). Raises
    django.core.exceptions.ValidationError for oversized/wrong-type/corrupt
    files (the view turns that into a 400) — never silently accepts a bad
    file. Resized/recompressed before upload — see _resize_and_compress."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError(f'Type de fichier non autorisé : {file.content_type}.')
    if file.size > MAX_UPLOAD_SIZE:
        raise ValidationError('Le fichier dépasse la taille maximale autorisée (5 Mo).')

    if file.content_type in PASSTHROUGH_CONTENT_TYPES:
        extension = os.path.splitext(file.name)[1] or '.png'
        return _upload_bytes(file.read(), file.content_type, extension, folder)

    data, content_type, extension = _resize_and_compress(file)
    return _upload_bytes(data, content_type, extension, folder)


def upload_video(file, folder: str) -> str:
    """Same as upload_image, but for the short demo clips used as a
    project's video_src — bigger size cap, video content-types only."""
    if file.content_type not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise ValidationError(f'Type de fichier non autorisé : {file.content_type}.')
    if file.size > MAX_VIDEO_UPLOAD_SIZE:
        raise ValidationError('Le fichier dépasse la taille maximale autorisée (25 Mo).')
    extension = os.path.splitext(file.name)[1] or '.mp4'
    return _upload_bytes(file.read(), file.content_type, extension, folder)


def upload_file(file, folder: str) -> str:
    """Uploads a chat attachment (documents/images, not arbitrary files) to
    Cloudinary and returns its public URL. Type-restricted to
    ALLOWED_CHAT_ATTACHMENT_TYPES — un fichier authentifié uploadé n'est pas
    pour autant un fichier de confiance ; un exécutable/script partagé en
    pièce jointe piège les collègues qui font confiance au lien."""
    if file.content_type not in ALLOWED_CHAT_ATTACHMENT_TYPES:
        raise ValidationError(f'Type de fichier non autorisé : {file.content_type}.')
    if file.size > MAX_FILE_UPLOAD_SIZE:
        raise ValidationError('Le fichier dépasse la taille maximale autorisée (20 Mo).')
    return _upload_to_cloudinary(file.read(), folder)


def _upload_bytes(data: bytes, content_type: str, extension: str, folder: str) -> str:
    _ensure_bucket()
    url, key = _supabase_config()
    path = f'{folder}/{uuid.uuid4()}{extension}'

    response = _session.post(
        f'{url}/storage/v1/object/{BUCKET_NAME}/{path}',
        headers={
            'Authorization': f'Bearer {key}',
            'apikey': key,
            'Content-Type': content_type,
        },
        data=data,
        timeout=30,
    )
    if response.status_code not in (200, 201):
        raise RuntimeError(f"Échec de l'upload vers Supabase Storage : {response.text}")

    return f'{url}/storage/v1/object/public/{BUCKET_NAME}/{path}'


# ---------------------------------------------------------------------------
# Pièces justificatives — bucket privé
# ---------------------------------------------------------------------------
# BUCKET_NAME est public : c'est voulu pour les visuels du site vitrine. Les
# justificatifs comptables (chèques, bordereaux, relevés bancaires) n'ont rien
# à y faire — une URL publique devinable exposerait des RIB et des montants
# clients à qui la trouve. D'où un second bucket, privé, servi uniquement par
# URL signée à durée limitée.
PRIVATE_BUCKET_NAME = 'documents'

# Durée d'une URL signée. Assez pour ouvrir ou télécharger la pièce depuis
# l'interface, trop court pour qu'un lien copié dans un e-mail reste utile.
SIGNED_URL_TTL_SECONDS = 300

# Type MIME deduit de l'extension, cote serveur. `UploadedFile.content_type`
# est l'en-tete multipart envoye par le client : Django ne le valide pas et
# ne le derive pas du contenu. Le repercuter tel quel vers Supabase laissait
# televerser un fichier nomme « facture.pdf » — seule chose que verifie
# FileExtensionValidator — annonce en text/html et contenant du script. Le
# lien signe le servait alors en text/html, et le script s'executait sur
# l'origine Supabase du projet.
#
# La table vit dans core.models, d'ou le validateur d'extensions se deduit :
# une extension est autorisee parce qu'on sait la servir sans risque, pas
# l'inverse. Import differe pour ne pas charger les modeles a l'import de ce
# module (storage est importe tot, models ne l'est pas encore partout).
def _mime_for_extension(extension: str) -> str:
    from core.models import DOCUMENT_ATTACHMENT_MIME_BY_EXTENSION

    return DOCUMENT_ATTACHMENT_MIME_BY_EXTENSION.get(
        extension, 'application/octet-stream',
    )

_private_bucket_ensured = False


def _ensure_private_bucket() -> None:
    global _private_bucket_ensured
    if _private_bucket_ensured:
        return
    url, key = _supabase_config()
    headers = {'Authorization': f'Bearer {key}', 'apikey': key}

    response = _session.post(
        f'{url}/storage/v1/bucket',
        headers=headers,
        json={'name': PRIVATE_BUCKET_NAME, 'id': PRIVATE_BUCKET_NAME, 'public': False},
        timeout=15,
    )

    if response.status_code not in (200, 201):
        # Un 400 « already exists » est le cas nominal au 2e appel. Mais un
        # bucket preexistant n'est pas forcement prive : s'il a ete cree a la
        # main ou par un autre outil avec public=true, tous les justificatifs
        # comptables partiraient dans un bucket dont Supabase autorise
        # l'enumeration sans authentification — les chemins en UUID ne
        # protegent plus rien face a un listing. Rien dans l'application ne
        # le signalerait : l'upload reussit, l'URL signee fonctionne.
        # On verifie donc l'etat reel avant de continuer.
        bucket = _session.get(
            f'{url}/storage/v1/bucket/{PRIVATE_BUCKET_NAME}',
            headers=headers,
            timeout=15,
        )
        if bucket.status_code != 200:
            raise RuntimeError(
                f'Bucket {PRIVATE_BUCKET_NAME} introuvable et non creable : '
                f'{response.text}'
            )
        if bucket.json().get('public'):
            raise RuntimeError(
                f'Le bucket {PRIVATE_BUCKET_NAME} est public. Refus de '
                'stocker des pieces justificatives comptables dans un bucket '
                'public : passez-le en prive dans Supabase avant de reessayer.'
            )

    _private_bucket_ensured = True


class SupabasePrivateStorage(Storage):
    """Backend de stockage Django adossé au bucket privé Supabase.

    Le stockage par défaut du projet est FileSystemStorage, et l'hébergement
    (Render) a un disque éphémère : une pièce justificative écrite sur disque
    disparaît au déploiement suivant. Pour des documents à valeur probante
    comptable, c'est une perte de données, pas une gêne.

    Implémenté comme un Storage plutôt qu'en appelant l'upload depuis la vue
    pour que le FileField continue de fonctionner normalement — validateurs,
    admin Django, `.url`, suppression en cascade.
    """

    def _open(self, name, mode='rb'):
        url, key = _supabase_config()
        response = _session.get(
            f'{url}/storage/v1/object/{PRIVATE_BUCKET_NAME}/{name}',
            headers={'Authorization': f'Bearer {key}', 'apikey': key},
            timeout=30,
        )
        if response.status_code != 200:
            raise FileNotFoundError(name)
        return File(io.BytesIO(response.content), name=name)

    def _save(self, name, content):
        _ensure_private_bucket()
        url, key = _supabase_config()

        # Le nom vient du fichier envoyé par l'utilisateur : on ne le
        # réutilise pas comme chemin. Un UUID écarte d'un coup la traversée
        # de répertoire, les collisions et l'écrasement d'une pièce
        # existante par un homonyme.
        extension = os.path.splitext(name)[1].lower()
        path = f'{uuid.uuid4()}{extension}'

        content.seek(0)
        response = _session.post(
            f'{url}/storage/v1/object/{PRIVATE_BUCKET_NAME}/{path}',
            headers={
                'Authorization': f'Bearer {key}',
                'apikey': key,
                # Derive de l'extension, jamais de content.content_type :
                # voir _mime_for_extension.
                'Content-Type': _mime_for_extension(extension),
                # Interdit d'ecraser un objet existant. Les chemins sont des
                # UUID donc la collision est theorique, mais l'ecrasement
                # d'une piece comptable ne doit pas dependre de ca.
                'x-upsert': 'false',
            },
            data=content.read(),
            timeout=60,
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"Échec de l'upload du justificatif : {response.text}")
        return path

    def delete(self, name):
        url, key = _supabase_config()
        _session.delete(
            f'{url}/storage/v1/object/{PRIVATE_BUCKET_NAME}/{name}',
            headers={'Authorization': f'Bearer {key}', 'apikey': key},
            timeout=15,
        )

    def exists(self, name):
        # Toujours False : les chemins sont des UUID générés dans _save, donc
        # jamais en collision. Répondre autrement obligerait à un aller-retour
        # réseau à chaque upload pour une question déjà tranchée.
        return False

    def size(self, name):
        url, key = _supabase_config()
        response = _session.head(
            f'{url}/storage/v1/object/{PRIVATE_BUCKET_NAME}/{name}',
            headers={'Authorization': f'Bearer {key}', 'apikey': key},
            timeout=15,
        )
        return int(response.headers.get('Content-Length', 0))

    def url(self, name):
        """URL signée, valable SIGNED_URL_TTL_SECONDS.

        Mise en cache un peu moins longtemps que sa validite. Signer est un
        aller-retour HTTP bloquant, et le serializer appelle cette methode
        une fois par piece affichee : sans cache, lister dix justificatifs
        coutait dix allers-retours en serie, refaits a chaque rafraichissement
        de l'ecran. Le cache les ramene a un par fichier et par fenetre.
        """
        from django.core.cache import cache

        cache_key = f'supabase:signed-url:{name}'
        cached = cache.get(cache_key)
        if cached:
            return cached

        url, key = _supabase_config()
        response = _session.post(
            f'{url}/storage/v1/object/sign/{PRIVATE_BUCKET_NAME}/{name}',
            headers={'Authorization': f'Bearer {key}', 'apikey': key},
            # `download` fait repondre Supabase en Content-Disposition:
            # attachment. Defense en profondeur derriere MIME_BY_EXTENSION :
            # un fichier telecharge ne s'execute pas dans la page, meme si
            # son type venait a etre errone.
            json={'expiresIn': SIGNED_URL_TTL_SECONDS, 'download': True},
            timeout=15,
        )
        if response.status_code != 200:
            raise RuntimeError(f"Impossible de signer l'URL du justificatif : {response.text}")

        signed = f"{url}/storage/v1{response.json()['signedURL']}"
        # Marge de 60 s : une URL servie juste avant l'expiration du cache
        # doit rester valable le temps que le navigateur la suive.
        cache.set(cache_key, signed, SIGNED_URL_TTL_SECONDS - 60)
        return signed
