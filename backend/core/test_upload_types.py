"""Le type d'un fichier televerse est deduit de son extension, cote serveur.

`UploadedFile.content_type` est l'en-tete multipart choisi par l'emetteur.
Les fonctions d'upload validaient contre lui puis le renvoyaient tel quel
comme Content-Type de stockage : l'emetteur decidait donc aussi de la facon
dont son fichier serait servi plus tard, depuis un bucket public.
"""

import io
from unittest import mock

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from core import storage


def _upload(name, content_type, content=b'contenu'):
    return SimpleUploadedFile(name, content, content_type=content_type)


class ResolveUploadTypeTests(TestCase):
    def test_declared_type_is_ignored_in_favour_of_the_extension(self):
        hostile = _upload('logo.png', 'text/html', b'<script>alert(1)</script>')

        extension, content_type = storage._resolve_upload_type(
            hostile, storage.IMAGE_MIME_BY_EXTENSION,
        )

        self.assertEqual(extension, '.png')
        self.assertEqual(content_type, 'image/png')

    def test_unknown_extension_is_refused_whatever_the_declared_type(self):
        with self.assertRaises(ValidationError):
            storage._resolve_upload_type(
                _upload('charge.html', 'image/png'), storage.IMAGE_MIME_BY_EXTENSION,
            )

    def test_extension_matching_is_case_insensitive(self):
        _extension, content_type = storage._resolve_upload_type(
            _upload('SCAN.JPG', 'image/jpeg'), storage.IMAGE_MIME_BY_EXTENSION,
        )
        self.assertEqual(content_type, 'image/jpeg')

    def test_no_table_can_serve_a_scriptable_document(self):
        tables = (
            storage.IMAGE_MIME_BY_EXTENSION,
            storage.VIDEO_MIME_BY_EXTENSION,
            storage.CHAT_ATTACHMENT_MIME_BY_EXTENSION,
        )
        for table in tables:
            for extension, mime in table.items():
                with self.subTest(extension=extension):
                    self.assertNotIn('html', mime)
                    self.assertNotIn('javascript', mime)
                    self.assertNotIn('svg', mime)


class SvgIsRefusedTests(TestCase):
    """Un SVG est un document scriptable, pas une image.

    Servi inline depuis le bucket public, il executerait son script sur
    l'origine Supabase du projet. Il traversait jusqu'ici sans recompression
    (Pillow ne sait pas le rasteriser), donc exactement tel que depose.
    """

    def test_svg_is_not_an_accepted_image(self):
        self.assertNotIn('.svg', storage.IMAGE_MIME_BY_EXTENSION)

    def test_upload_image_refuses_an_svg(self):
        svg = _upload(
            'logo.svg', 'image/svg+xml',
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        )
        with self.assertRaises(ValidationError):
            storage.upload_image(svg, folder='page-sections')

    def test_upload_avatar_refuses_an_svg(self):
        with self.assertRaises(ValidationError):
            storage.upload_avatar(_upload('moi.svg', 'image/svg+xml', b'<svg/>'))

    def test_chat_attachment_refuses_an_svg(self):
        with self.assertRaises(ValidationError):
            storage.upload_file(_upload('piece.svg', 'image/svg+xml', b'<svg/>'), folder='chat')


class StoredContentTypeTests(TestCase):
    """Ce qui part vers Supabase doit porter le type derive, pas le declare."""

    def setUp(self):
        self.env = mock.patch.dict('os.environ', {
            'SUPABASE_URL': 'https://projet.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'cle-de-test',
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        storage._bucket_ensured = True
        self.addCleanup(setattr, storage, '_bucket_ensured', False)

    def test_gif_passthrough_stores_the_derived_type(self):
        # Le GIF traverse sans recompression : c'est le seul chemin ou le
        # type declare atteignait autrefois le stockage intact.
        hostile = _upload('anim.gif', 'text/html', b'GIF89a')
        posted = mock.Mock(status_code=200, text='{}')

        with mock.patch.object(storage._session, 'post', return_value=posted) as post:
            storage.upload_image(hostile, folder='page-sections')

        self.assertEqual(post.call_args.kwargs['headers']['Content-Type'], 'image/gif')

    def test_video_stores_the_derived_type(self):
        hostile = _upload('demo.mp4', 'text/html', b'\x00\x00\x00\x18ftypmp42')
        posted = mock.Mock(status_code=200, text='{}')

        with mock.patch.object(storage._session, 'post', return_value=posted) as post:
            storage.upload_video(hostile, folder='showcase-projects')

        self.assertEqual(post.call_args.kwargs['headers']['Content-Type'], 'video/mp4')

    def test_recompressed_image_keeps_the_type_pillow_produced(self):
        buffer = io.BytesIO()
        from PIL import Image

        Image.new('RGB', (10, 10), color='red').save(buffer, format='PNG')
        # Nomme .jpg, encode en PNG : Pillow tranche, pas le nom.
        renamed = _upload('photo.jpg', 'text/html', buffer.getvalue())
        posted = mock.Mock(status_code=200, text='{}')

        with mock.patch.object(storage._session, 'post', return_value=posted) as post:
            storage.upload_image(renamed, folder='page-sections')

        self.assertEqual(post.call_args.kwargs['headers']['Content-Type'], 'image/jpeg')


class CloudinaryPublicIdTests(TestCase):
    """Cloudinary sert un fichier « raw » d'apres l'extension du public_id.

    Sans extension, il devinait le type depuis les octets d'un fichier choisi
    par l'utilisateur.
    """

    def test_public_id_carries_the_validated_extension(self):
        with mock.patch.object(storage, '_cloudinary_configure'), \
             mock.patch.object(
                 storage.cloudinary.uploader, 'upload',
                 return_value={'secure_url': 'https://res.cloudinary.com/x.pdf'},
             ) as upload:
            storage.upload_file(_upload('rapport.pdf', 'text/html', b'%PDF-1.4'), folder='chat')

        self.assertTrue(upload.call_args.kwargs['public_id'].endswith('.pdf'))
