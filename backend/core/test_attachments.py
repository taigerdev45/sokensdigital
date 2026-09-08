import os
from unittest import mock

from django.test import TestCase
"""Endpoint des pieces justificatives (core/attachment_views.py).

L'enjeu teste ici n'est pas le CRUD mais l'autorisation : une
GenericForeignKey non bridee laisse rattacher un fichier a n'importe quelle
ligne de n'importe quelle table, puis la relire.
"""


from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APITestCase

from core.constants import ROLE_ADMIN, ROLE_COMPTABLE, ROLE_DEVELOPER
from core.models import DocumentAttachment, Role, User
from finance.models import Invoice


def _pdf(name='justificatif.pdf'):
    # En-tete PDF reel : le validateur d'extension seul ne dit rien du
    # contenu, autant que la fixture soit honnete.
    return SimpleUploadedFile(name, b'%PDF-1.4\n%%EOF\n', content_type='application/pdf')


class DocumentAttachmentTests(APITestCase):
    def setUp(self):
        self.comptable = User.objects.create(email='compta@sokens.test')
        self.comptable.roles.add(Role.objects.get_or_create(name=ROLE_COMPTABLE)[0])

        self.admin = User.objects.create(email='admin@sokens.test')
        self.admin.roles.add(Role.objects.get_or_create(name=ROLE_ADMIN)[0])

        self.dev = User.objects.create(email='dev@sokens.test')
        self.dev.roles.add(Role.objects.get_or_create(name=ROLE_DEVELOPER)[0])

        self.invoice = Invoice.objects.create(
            client_name='Client Test', amount_ht=100000, issue_date='2026-01-15',
        )
        self.list_url = reverse('attachment-list')

    def _payload(self, **overrides):
        data = {
            'content_type': 'finance.invoice',
            'object_id': str(self.invoice.pk),
            'document_type': 'INVOICE',
            'file': _pdf(),
        }
        data.update(overrides)
        return data

    def test_accountant_uploads_and_lists(self):
        self.client.force_authenticate(user=self.comptable)

        response = self.client.post(self.list_url, self._payload(), format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['file_name'], 'justificatif.pdf')
        # Le chemin brut dans le bucket ne doit jamais sortir.
        self.assertNotIn('file', response.data)

        listing = self.client.get(
            self.list_url,
            {'content_type': 'finance.invoice', 'object_id': str(self.invoice.pk)},
        )
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data['count'], 1)

    def test_developer_cannot_attach_to_an_invoice(self):
        self.client.force_authenticate(user=self.dev)
        response = self.client.post(self.list_url, self._payload(), format='multipart')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(DocumentAttachment.objects.count(), 0)

    def test_model_outside_the_allowlist_is_refused(self):
        # Sans allowlist, ceci accrocherait un fichier a un compte
        # utilisateur — et le relirait.
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.list_url,
            self._payload(content_type='core.user', object_id=str(self.dev.pk)),
            format='multipart',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('content_type', response.data)
        self.assertEqual(DocumentAttachment.objects.count(), 0)

    def test_nonexistent_target_is_refused(self):
        self.client.force_authenticate(user=self.comptable)
        response = self.client.post(
            self.list_url,
            self._payload(object_id='00000000-0000-0000-0000-000000000000'),
            format='multipart',
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(DocumentAttachment.objects.count(), 0)

    def test_disallowed_extension_is_refused(self):
        self.client.force_authenticate(user=self.comptable)
        executable = SimpleUploadedFile(
            'charge.exe', b'MZ\x90\x00', content_type='application/octet-stream',
        )
        response = self.client.post(
            self.list_url, self._payload(file=executable), format='multipart',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('file', response.data)
        self.assertEqual(DocumentAttachment.objects.count(), 0)

    def test_unknown_document_type_is_refused(self):
        self.client.force_authenticate(user=self.comptable)
        response = self.client.post(
            self.list_url, self._payload(document_type='INVENTE'), format='multipart',
        )

        self.assertEqual(response.status_code, 400)

    def test_listing_requires_a_target(self):
        # Il ne doit pas exister de vue « toutes les pieces », qui reviendrait
        # a un acces global aux justificatifs comptables.
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 400)

    def test_only_administration_deletes(self):
        self.client.force_authenticate(user=self.comptable)
        created = self.client.post(self.list_url, self._payload(), format='multipart')
        detail = reverse('attachment-detail', kwargs={'pk': created.data['id']})
        query = {'content_type': 'finance.invoice', 'object_id': str(self.invoice.pk)}

        refused = self.client.delete(detail, query)
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(DocumentAttachment.objects.count(), 1)

        self.client.force_authenticate(user=self.admin)
        accepted = self.client.delete(detail, query)
        self.assertEqual(accepted.status_code, 204)
        self.assertEqual(DocumentAttachment.objects.count(), 0)


class DocumentAttachmentSecurityTests(APITestCase):
    """Regressions issues de la revue de securite du 03/09/2026."""

    def setUp(self):
        from core.constants import ROLE_CAISSIER

        self.comptable = User.objects.create(email='sec-compta@sokens.test')
        self.comptable.roles.add(Role.objects.get_or_create(name=ROLE_COMPTABLE)[0])

        self.caissier = User.objects.create(email='sec-caisse@sokens.test')
        self.caissier.roles.add(Role.objects.get_or_create(name=ROLE_CAISSIER)[0])

        self.invoice = Invoice.objects.create(
            client_name='Client Test', amount_ht=100000, issue_date='2026-01-15',
        )
        self.list_url = reverse('attachment-list')

    def test_caissier_cannot_reach_client_payment_documents(self):
        """Le perimetre du Caissier s'arrete a la caisse.

        L'endpoint `encaissements` lui refuse deja banque et versements
        clients ; les pieces de finance.payment le lui rouvraient.
        """
        from finance.models import Payment

        payment = Payment.objects.create(
            invoice=self.invoice, amount=1000, payment_date='2026-01-20',
            payment_method='CHEQUE',
        )
        self.client.force_authenticate(user=self.caissier)

        response = self.client.get(self.list_url, {
            'content_type': 'finance.payment', 'object_id': str(payment.pk),
        })
        self.assertEqual(response.status_code, 403)

    def test_malformed_object_id_is_a_bad_request_not_a_server_error(self):
        self.client.force_authenticate(user=self.comptable)

        response = self.client.get(self.list_url, {
            'content_type': 'finance.invoice', 'object_id': 'pas-un-uuid',
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('object_id', response.data)

    def test_stored_content_type_comes_from_the_extension_not_the_client(self):
        """Un PDF annonce en text/html ne doit pas etre stocke en text/html.

        Sinon le lien signe le sert tel quel et le script s'execute sur
        l'origine Supabase.
        """
        from core.storage import MIME_BY_EXTENSION

        self.assertEqual(MIME_BY_EXTENSION['.pdf'], 'application/pdf')
        # Aucune valeur de la table ne peut faire executer du script.
        for mime in MIME_BY_EXTENSION.values():
            self.assertNotIn('html', mime)
            self.assertNotIn('javascript', mime)
            self.assertNotIn('svg', mime)

    def test_every_allowed_extension_has_a_server_side_mime(self):
        """Une extension acceptee sans entree dans la table retomberait sur
        application/octet-stream — le lien deviendrait inutilisable en
        silence."""
        from core.models import DOCUMENT_ATTACHMENT_ALLOWED_EXTENSIONS
        from core.storage import MIME_BY_EXTENSION

        for extension in DOCUMENT_ATTACHMENT_ALLOWED_EXTENSIONS:
            self.assertIn(f'.{extension}', MIME_BY_EXTENSION)


class PrivateBucketGuardTests(TestCase):
    """`_ensure_private_bucket` supposait le bucket prive sans le verifier.

    Un bucket `documents` preexistant en public aurait recu tous les
    justificatifs comptables : Supabase autorise l'enumeration des objets
    d'un bucket public sans authentification, ce qui annule la protection
    des chemins en UUID. Rien dans l'application ne l'aurait signale.
    """

    def setUp(self):
        import core.storage as storage

        self.storage = storage
        storage._private_bucket_ensured = False
        self.env = mock.patch.dict(os.environ, {
            'SUPABASE_URL': 'https://projet.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'cle-de-test',
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(setattr, storage, '_private_bucket_ensured', False)

    def test_refuses_to_use_an_existing_public_bucket(self):
        create = mock.Mock(status_code=400, text='Bucket already exists')
        get = mock.Mock(status_code=200)
        get.json.return_value = {'name': 'documents', 'public': True}

        with mock.patch.object(self.storage.requests, 'post', return_value=create), \
             mock.patch.object(self.storage.requests, 'get', return_value=get):
            with self.assertRaises(RuntimeError) as caught:
                self.storage._ensure_private_bucket()

        self.assertIn('public', str(caught.exception))
        # L'echec ne doit pas etre memorise comme un succes : le prochain
        # appel doit reverifier, pas passer en silence.
        self.assertFalse(self.storage._private_bucket_ensured)

    def test_accepts_an_existing_private_bucket(self):
        create = mock.Mock(status_code=400, text='Bucket already exists')
        get = mock.Mock(status_code=200)
        get.json.return_value = {'name': 'documents', 'public': False}

        with mock.patch.object(self.storage.requests, 'post', return_value=create), \
             mock.patch.object(self.storage.requests, 'get', return_value=get):
            self.storage._ensure_private_bucket()

        self.assertTrue(self.storage._private_bucket_ensured)

    def test_refuses_when_the_bucket_can_be_neither_created_nor_read(self):
        create = mock.Mock(status_code=400, text='Bucket already exists')
        get = mock.Mock(status_code=404)

        with mock.patch.object(self.storage.requests, 'post', return_value=create), \
             mock.patch.object(self.storage.requests, 'get', return_value=get):
            with self.assertRaises(RuntimeError):
                self.storage._ensure_private_bucket()
