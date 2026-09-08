"""Pièces justificatives génériques (`core.DocumentAttachment`).

Module séparé de `core/views.py` parce que la question centrale ici n'est pas
le CRUD mais l'autorisation : `DocumentAttachment` porte une GenericForeignKey,
donc un endpoint naïf laisserait n'importe quel utilisateur authentifié
accrocher un fichier à n'importe quelle ligne de n'importe quelle table, puis
la relire. Le contrôle tient dans `ATTACHABLE_MODELS` et
`_assert_can_attach()` ci-dessous, et mérite d'être lisible d'un bloc.
"""

import logging

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from core.constants import (
    ADMIN_ROLES,
    FINANCE_ROLES,
    MANAGEMENT_ROLES,
    ROLE_CAISSIER,
    ROLE_COMPTABLE,
)
from core.models import AuditLog, DocumentAttachment
from core.permissions import has_role

logger = logging.getLogger(__name__)

# Modèles auxquels une pièce peut être rattachée, et rôles autorisés à le
# faire. Allowlist et non blocklist : un modèle absent d'ici est refusé, donc
# ajouter un modèle au projet ne l'expose pas par accident.
#
# Clé : 'app_label.modelname' en minuscules (format ContentType).
#
# Le Caissier tient la caisse : il a les entrees/sorties especes et les
# decaissements qu'il paie, pas la banque ni les versements clients. C'est
# exactement le decoupage applique par l'endpoint `encaissements`
# (finance/views.py), ou la banque et les versements sont reserves aux roles
# finance. Lui donner ici les pieces de finance.payment aurait rouvert par
# la bande ce que cet endpoint lui refuse.
ATTACHABLE_MODELS = {
    'finance.payment': [*FINANCE_ROLES, ROLE_COMPTABLE],
    'finance.invoice': [*FINANCE_ROLES, ROLE_COMPTABLE],
    'marketing.quote': [*FINANCE_ROLES, ROLE_COMPTABLE],
    'treasury.cashentry': [*FINANCE_ROLES, ROLE_COMPTABLE, ROLE_CAISSIER],
    'treasury.bankentry': [*FINANCE_ROLES, ROLE_COMPTABLE],
    'treasury.capitalcontribution': [*FINANCE_ROLES],
    'finance.disbursementrequest': [*FINANCE_ROLES, ROLE_COMPTABLE, ROLE_CAISSIER],
    'procurement.procurementrequest': [*FINANCE_ROLES, ROLE_COMPTABLE, *MANAGEMENT_ROLES],
    'procurement.supplierinvoice': [*FINANCE_ROLES, ROLE_COMPTABLE],
}


class DocumentAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    document_type_display = serializers.CharField(
        source='get_document_type_display', read_only=True,
    )

    class Meta:
        model = DocumentAttachment
        fields = [
            'id', 'document_type', 'document_type_display', 'file_url',
            'file_name', 'file_size', 'notes', 'uploaded_by',
            'uploaded_by_name', 'created_at',
        ]
        # `file` est absent volontairement : on ne renvoie jamais le chemin
        # brut dans le bucket, seulement une URL signée à durée limitée.
        read_only_fields = ['file_size', 'uploaded_by', 'created_at']

    def get_file_url(self, obj):
        if not obj.file:
            return None
        try:
            return obj.file.url
        except Exception:
            # Signature impossible (Supabase injoignable, objet supprimé du
            # bucket) : la liste des pièces doit rester consultable, avec un
            # lien manquant plutôt qu'une 500 sur tout l'écran.
            logger.warning("URL de justificatif indisponible pour %s", obj.pk, exc_info=True)
            return None

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        full = f'{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}'.strip()
        return full or obj.uploaded_by.email


class DocumentAttachmentViewSet(viewsets.ModelViewSet):
    """Upload, liste et suppression de pièces justificatives.

    Toujours dans le contexte d'un objet cible, passé en paramètre
    `content_type` + `object_id` : il n'existe pas de vue « toutes les pièces »,
    qui reviendrait à un accès global aux justificatifs comptables.
    """

    serializer_class = DocumentAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def _target(self):
        """Résout la cible depuis la requête et vérifie qu'elle est permise."""
        params = self.request.data if self.request.method == 'POST' else self.request.query_params
        label = (params.get('content_type') or '').lower().strip()
        object_id = (params.get('object_id') or '').strip()

        if not label or not object_id:
            raise serializers.ValidationError(
                {'content_type': 'content_type et object_id sont requis.'}
            )
        if label not in ATTACHABLE_MODELS:
            raise serializers.ValidationError(
                {'content_type': f"Aucune pièce justificative ne peut être rattachée à « {label} »."}
            )

        app_label, model = label.split('.', 1)
        # get_by_natural_key passe par le cache de ContentType propre au
        # processus ; un get() ordinaire refait la requete a chaque appel.
        # Le label vient de l'allowlist, donc son absence est une erreur de
        # configuration, pas une requete invalide.
        try:
            content_type = ContentType.objects.get_by_natural_key(app_label, model)
        except ContentType.DoesNotExist:
            logger.error('ATTACHABLE_MODELS reference un modele inconnu : %s', label)
            raise serializers.ValidationError(
                {'content_type': f"Modele « {label} » introuvable."}
            )

        # L'objet doit exister : sans cette vérification, l'endpoint accepte
        # des pièces orphelines rattachées à un identifiant inventé.
        #
        # Les modèles cibles héritent de LoggedModel, dont la clé primaire
        # est un UUID : un object_id malformé fait lever un ValidationError
        # à la couche ORM, soit une 500 là où la requête est simplement
        # invalide.
        try:
            get_object_or_404(content_type.model_class(), pk=object_id)
        except (DjangoValidationError, ValueError):
            raise serializers.ValidationError(
                {'object_id': "L'identifiant fourni n'est pas valide."}
            )
        return content_type, object_id, label

    def _assert_can_attach(self, label):
        allowed = ATTACHABLE_MODELS[label]
        if not has_role(self.request.user, *allowed):
            raise PermissionDenied(
                "Votre rôle ne vous permet pas d'accéder aux pièces justificatives "
                'de ce document.'
            )

    def get_queryset(self):
        base = DocumentAttachment.objects.select_related('uploaded_by', 'content_type')

        # Sur une route de detail, la cible se deduit de la piece elle-meme :
        # un DELETE ne transporte pas de query string, et l'exiger obligerait
        # l'appelant a nous redire ce que la base sait deja. Le controle de
        # role n'est pas perdu pour autant — il est refait dans get_object()
        # a partir du content_type reel de l'objet.
        if self.detail:
            return base

        content_type, object_id, label = self._target()
        self._assert_can_attach(label)
        return base.filter(content_type=content_type, object_id=object_id)

    def get_object(self):
        attachment = super().get_object()
        label = f'{attachment.content_type.app_label}.{attachment.content_type.model}'
        if label not in ATTACHABLE_MODELS:
            # Piece heritee, rattachee a un modele qui n'est plus (ou n'a
            # jamais ete) expose ici : on refuse plutot que de deviner qui a
            # le droit de la lire.
            raise PermissionDenied(
                "Ce type de pièce justificative n'est pas accessible par cette interface."
            )
        self._assert_can_attach(label)
        return attachment

    def create(self, request, *args, **kwargs):
        content_type, object_id, label = self._target()
        self._assert_can_attach(label)

        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response(
                {'file': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST,
            )

        document_type = request.data.get('document_type', 'OTHER')
        valid_types = {choice for choice, _ in DocumentAttachment.DOCUMENT_TYPES}
        if document_type not in valid_types:
            return Response(
                {'document_type': f'Type de document inconnu : {document_type}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attachment = DocumentAttachment(
            content_type=content_type,
            object_id=object_id,
            document_type=document_type,
            file=uploaded,
            # Le nom d'origine n'est conservé que pour l'affichage et le
            # téléchargement ; il ne sert jamais de chemin de stockage (cf.
            # SupabasePrivateStorage._save, qui génère un UUID).
            file_name=uploaded.name[:255],
            notes=request.data.get('notes', ''),
            uploaded_by=request.user,
        )
        try:
            # full_clean déclenche les validateurs du modèle (extensions
            # autorisées, taille max). Sans lui, un FileField accepte
            # n'importe quoi via l'API : les validators ne tournent pas tout
            # seuls à l'enregistrement.
            attachment.full_clean(exclude=['content_object'])
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)

        attachment.save()

        AuditLog.objects.create(
            user=request.user, action='UPLOAD', entity_type='DocumentAttachment',
            entity_id=str(attachment.pk),
            details={
                'target': label,
                'target_id': str(object_id),
                'document_type': document_type,
                'file_name': attachment.file_name,
            },
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response(
            self.get_serializer(attachment).data, status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        # Une pièce justificative supprimée est une trace comptable qui
        # disparaît : réservé à l'administration, et journalisé avant l'acte
        # pour que l'entrée subsiste même si la suppression aboutit.
        if not has_role(self.request.user, *ADMIN_ROLES):
            raise PermissionDenied(
                'Seule l’administration peut supprimer une pièce justificative.'
            )
        AuditLog.objects.create(
            user=self.request.user, action='DELETE', entity_type='DocumentAttachment',
            entity_id=str(instance.pk),
            details={'file_name': instance.file_name, 'document_type': instance.document_type},
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )
        instance.delete()
