import io
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from decimal import Decimal

from core.constants import (
    ROLE_COMMERCIAL, ROLE_DEVELOPER, ROLE_PROJECT_MANAGER,
    ROLE_RESPONSABLE_MARKETING, ROLE_SUPER_ADMIN,
)
from core.models import Role, User
from marketing.models import BlogPost, Lead, PageSection, Quote, ShowcaseProject, SocialPost, Specification


def _give_role(user, name):
    role, _ = Role.objects.get_or_create(name=name)
    user.roles.add(role)
    return role


class PublicLeadCreateTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def valid_payload(self, **overrides):
        payload = {
            'first_name': 'Ada',
            'last_name': 'Lovelace',
            'company_name': 'Analytical Engines Inc.',
            'email': 'ada@example.com',
            'phone': '+33612345678',
            'source': 'FORMULAIRE_CONTACT',
            'message': 'Intéressée par vos services.',
        }
        payload.update(overrides)
        return payload

    def test_public_can_create_lead(self):
        response = self.client.post('/api/v1/public/leads/', self.valid_payload(), format='json')
        self.assertEqual(response.status_code, 201)

    def test_public_can_set_estimated_value(self):
        # The "Démarrer un projet" wizard's Budget field — unlike
        # status/qualification_score, this one IS meant to be settable
        # from the public form so the weighted-pipeline dashboard metric
        # reflects organic web leads.
        response = self.client.post('/api/v1/public/leads/', self.valid_payload(estimated_value='5000'), format='json')
        self.assertEqual(response.status_code, 201)
        lead = Lead.objects.get(email='ada@example.com')
        self.assertEqual(str(lead.estimated_value), '5000.00')
        self.assertEqual(Lead.objects.count(), 1)
        self.assertEqual(Lead.objects.first().status, 'NOUVEAU')

    def test_public_cannot_set_status_or_assignment(self):
        response = self.client.post(
            '/api/v1/public/leads/',
            self.valid_payload(status='CONVERTI', qualification_score=100),
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        lead = Lead.objects.first()
        self.assertEqual(lead.status, 'NOUVEAU')
        self.assertEqual(lead.qualification_score, 0)

    def test_rate_limit_blocks_after_three_per_minute(self):
        for _ in range(3):
            response = self.client.post('/api/v1/public/leads/', self.valid_payload(), format='json')
            self.assertEqual(response.status_code, 201)
        response = self.client.post('/api/v1/public/leads/', self.valid_payload(), format='json')
        self.assertEqual(response.status_code, 429)

    def test_rate_limit_is_per_ip(self):
        for _ in range(3):
            self.client.post('/api/v1/public/leads/', self.valid_payload(), format='json', REMOTE_ADDR='1.1.1.1')
        blocked = self.client.post('/api/v1/public/leads/', self.valid_payload(), format='json', REMOTE_ADDR='1.1.1.1')
        self.assertEqual(blocked.status_code, 429)
        still_ok = self.client.post('/api/v1/public/leads/', self.valid_payload(), format='json', REMOTE_ADDR='2.2.2.2')
        self.assertEqual(still_ok.status_code, 201)

    @patch('marketing.ratelimit.cache.incr', side_effect=ConnectionError('Redis unreachable'))
    def test_submission_still_works_if_cache_backend_is_down(self, mock_incr):
        # is_rate_limited() must fail open — a cache/Redis outage should
        # never take down the whole public form with a 500.
        response = self.client.post('/api/v1/public/leads/', self.valid_payload(), format='json')
        self.assertEqual(response.status_code, 201)


class LeadViewSetTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.marketing_user = User.objects.create(email='marketing@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.commercial_a = User.objects.create(email='commercial-a@sokensdigital.com', first_name='CommercialA')
        _give_role(self.commercial_a, ROLE_COMMERCIAL)

        self.commercial_b = User.objects.create(email='commercial-b@sokensdigital.com', first_name='CommercialB')
        _give_role(self.commercial_b, ROLE_COMMERCIAL)

        self.outsider = User.objects.create(email='dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.lead_a = Lead.objects.create(
            first_name='Ada', last_name='Lovelace', email='ada@example.com',
            source='SITE_WEB', assigned_to=self.commercial_a,
        )
        self.lead_b = Lead.objects.create(
            first_name='Grace', last_name='Hopper', email='grace@example.com',
            source='SITE_WEB', assigned_to=self.commercial_b,
        )

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)

        self.client_commercial_a = APIClient()
        self.client_commercial_a.force_authenticate(user=self.commercial_a)

        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def test_marketing_sees_all_leads(self):
        ids = [l['id'] for l in self.client_marketing.get('/api/v1/marketing/leads/').json()['results']]
        self.assertIn(str(self.lead_a.id), ids)
        self.assertIn(str(self.lead_b.id), ids)

    def test_commercial_sees_only_own_leads(self):
        ids = [l['id'] for l in self.client_commercial_a.get('/api/v1/marketing/leads/').json()['results']]
        self.assertEqual(ids, [str(self.lead_a.id)])

    def test_outsider_forbidden(self):
        response = self.client_outsider.get('/api/v1/marketing/leads/')
        self.assertEqual(response.status_code, 403)

    def test_commercial_cannot_access_other_commercials_lead(self):
        response = self.client_commercial_a.get(f'/api/v1/marketing/leads/{self.lead_b.id}/')
        self.assertEqual(response.status_code, 404)

    def test_marketing_can_qualify_and_reassign(self):
        response = self.client_marketing.patch(
            f'/api/v1/marketing/leads/{self.lead_a.id}/',
            {'status': 'QUALIFIE', 'qualification_score': 80, 'assigned_to_id': str(self.commercial_b.id)},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.lead_a.refresh_from_db()
        self.assertEqual(self.lead_a.status, 'QUALIFIE')
        self.assertEqual(self.lead_a.qualification_score, 80)
        self.assertEqual(self.lead_a.assigned_to_id, self.commercial_b.id)

    def test_invalid_qualification_score_rejected(self):
        response = self.client_marketing.patch(
            f'/api/v1/marketing/leads/{self.lead_a.id}/',
            {'qualification_score': 150},
            format='json',
        )
        self.assertEqual(response.status_code, 400)


class BlogPostViewSetTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='marketing@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.outsider = User.objects.create(email='dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)

        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

        self.draft_payload = {
            'title': "L'avenir de la Cyber-Sécurité",
            'content': '<p>Bonjour le monde.</p>',
            'cover_image': '',
        }

    def test_marketing_can_create_draft(self):
        response = self.client_marketing.post('/api/v1/marketing/cms/blog/', self.draft_payload, format='json')
        self.assertEqual(response.status_code, 201)
        post = BlogPost.objects.get(slug='lavenir-de-la-cyber-securite')
        self.assertEqual(post.author, self.marketing_user)
        self.assertEqual(post.status, 'BROUILLON')
        self.assertIsNone(post.published_at)

    def test_publishing_sets_published_at(self):
        post = BlogPost.objects.create(title='Test', content='')
        response = self.client_marketing.patch(
            f'/api/v1/marketing/cms/blog/{post.id}/', {'status': 'PUBLIE'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.status, 'PUBLIE')
        self.assertIsNotNone(post.published_at)

    def test_outsider_cannot_manage_cms(self):
        response = self.client_outsider.post('/api/v1/marketing/cms/blog/', self.draft_payload, format='json')
        self.assertEqual(response.status_code, 403)

    def test_public_list_only_shows_published(self):
        BlogPost.objects.create(title='Brouillon Titre Unique', status='BROUILLON', content='')
        published = BlogPost.objects.create(title='Publié Titre Unique', status='PUBLIE', content='')

        anon = APIClient()
        response = anon.get('/api/v1/public/cms/blog/')
        self.assertEqual(response.status_code, 200)
        slugs = [p['slug'] for p in response.json()['results']]
        self.assertIn(published.slug, slugs)
        self.assertNotIn('brouillon-titre-unique', slugs)

    def test_public_detail_404s_on_draft(self):
        draft = BlogPost.objects.create(title='Brouillon', status='BROUILLON', content='')
        anon = APIClient()
        response = anon.get(f'/api/v1/public/cms/blog/{draft.slug}/')
        self.assertEqual(response.status_code, 404)

    def test_public_detail_returns_published_post_content(self):
        post = BlogPost.objects.create(title='Publié', status='PUBLIE', content='<p>Salut</p>')
        anon = APIClient()
        response = anon.get(f'/api/v1/public/cms/blog/{post.slug}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['content'], '<p>Salut</p>')


class ShowcaseProjectViewSetTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='marketing@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.outsider = User.objects.create(email='dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)

        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

        self.payload = {
            'category': 'FINTECH', 'sector': 'Fintech', 'type': 'Sécurité',
            'title': 'Test Project', 'description': 'Une description.',
            'visual_icon': 'shield-check', 'technologies': ['Rust'],
            'stats': [{'value': '99%', 'label': 'Uptime'}],
            'solution_points': ['Point A'],
        }

    def test_marketing_can_create_project(self):
        response = self.client_marketing.post('/api/v1/marketing/cms/showcase-projects/', self.payload, format='json')
        self.assertEqual(response.status_code, 201)
        project = ShowcaseProject.objects.get(slug='test-project')
        self.assertTrue(project.is_active)

    def test_new_project_appends_to_end_of_order_regardless_of_payload(self):
        # The seed data migration already has 7 projects at order 0-6.
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/showcase-projects/', {**self.payload, 'order': 0}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        project = ShowcaseProject.objects.get(slug='test-project')
        self.assertEqual(project.order, 7)

    def test_outsider_cannot_manage_projects(self):
        response = self.client_outsider.post('/api/v1/marketing/cms/showcase-projects/', self.payload, format='json')
        self.assertEqual(response.status_code, 403)

    def test_marketing_can_update_project(self):
        project = ShowcaseProject.objects.create(title='Original Titre Unique', **{k: v for k, v in self.payload.items() if k != 'title'})
        response = self.client_marketing.patch(
            f'/api/v1/marketing/cms/showcase-projects/{project.id}/', {'title': 'Updated', 'is_active': False}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        project.refresh_from_db()
        self.assertEqual(project.title, 'Updated')
        self.assertFalse(project.is_active)
        # slug stays stable — only auto-derived once, on first save.
        self.assertEqual(project.slug, 'original-titre-unique')

    def test_public_list_only_shows_active(self):
        ShowcaseProject.objects.create(title='Inactif Titre Unique', is_active=False, **{k: v for k, v in self.payload.items() if k != 'title'})
        active = ShowcaseProject.objects.create(title='Actif Titre Unique', **{k: v for k, v in self.payload.items() if k != 'title'})

        anon = APIClient()
        response = anon.get('/api/v1/public/showcase-projects/')
        self.assertEqual(response.status_code, 200)
        slugs = [p['slug'] for p in response.json()]
        self.assertIn(active.slug, slugs)
        self.assertNotIn('inactif-titre-unique', slugs)

    def test_public_detail_404s_on_inactive(self):
        inactive = ShowcaseProject.objects.create(title='Inactif', is_active=False, **{k: v for k, v in self.payload.items() if k != 'title'})
        anon = APIClient()
        response = anon.get(f'/api/v1/public/showcase-projects/{inactive.slug}/')
        self.assertEqual(response.status_code, 404)

    def test_public_detail_returns_full_case_study(self):
        project = ShowcaseProject.objects.create(title='Actif', **{k: v for k, v in self.payload.items() if k != 'title'})
        anon = APIClient()
        response = anon.get(f'/api/v1/public/showcase-projects/{project.slug}/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['solution_points'], ['Point A'])
        self.assertNotIn('id', data)
        self.assertNotIn('is_active', data)


class SocialPostViewSetTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='marketing@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.commercial = User.objects.create(email='commercial@sokensdigital.com', first_name='Commercial')
        _give_role(self.commercial, ROLE_COMMERCIAL)

        self.outsider = User.objects.create(email='dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)

        self.client_commercial = APIClient()
        self.client_commercial.force_authenticate(user=self.commercial)

        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def payload(self, **overrides):
        data = {
            'title': 'Annonce', 'content': 'Contenu du post.', 'platform': 'FACEBOOK',
            'image_path': 'https://example.com/cover.jpg',
        }
        data.update(overrides)
        return data

    def test_marketing_can_create_and_it_starts_as_draft(self):
        response = self.client_marketing.post('/api/v1/marketing/social-posts/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['status'], 'BROUILLON')

    def test_commercial_can_create_draft(self):
        response = self.client_commercial.post('/api/v1/marketing/social-posts/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201)

    def test_commercial_cannot_force_scheduled_status(self):
        response = self.client_commercial.post(
            '/api/v1/marketing/social-posts/', self.payload(status='PROGRAMME'), format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_outsider_forbidden(self):
        response = self.client_outsider.post('/api/v1/marketing/social-posts/', self.payload(), format='json')
        self.assertEqual(response.status_code, 403)

    def test_post_without_image_rejected(self):
        response = self.client_marketing.post(
            '/api/v1/marketing/social-posts/', self.payload(image_path=''), format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_marketing_can_schedule_post_with_date(self):
        post = SocialPost.objects.create(
            title='T', content='C', platform='FACEBOOK', author=self.marketing_user,
            image_path='https://example.com/cover.jpg',
        )
        response = self.client_marketing.patch(
            f'/api/v1/marketing/social-posts/{post.id}/', {'scheduled_at': '2026-08-01T10:00:00Z'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        response = self.client_marketing.post(f'/api/v1/marketing/social-posts/{post.id}/schedule/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'PROGRAMME')

    def test_cannot_schedule_without_date(self):
        post = SocialPost.objects.create(title='T', content='C', platform='FACEBOOK', author=self.marketing_user)
        response = self.client_marketing.post(f'/api/v1/marketing/social-posts/{post.id}/schedule/')
        self.assertEqual(response.status_code, 400)

    def test_commercial_cannot_schedule(self):
        post = SocialPost.objects.create(
            title='T', content='C', platform='FACEBOOK', author=self.commercial,
            scheduled_at='2026-08-01T10:00:00Z',
        )
        response = self.client_commercial.post(f'/api/v1/marketing/social-posts/{post.id}/schedule/')
        self.assertEqual(response.status_code, 403)

    def test_marketing_can_cancel_scheduled_post(self):
        post = SocialPost.objects.create(
            title='T', content='C', platform='FACEBOOK', author=self.marketing_user,
            status='PROGRAMME', scheduled_at='2026-08-01T10:00:00Z',
        )
        response = self.client_marketing.post(f'/api/v1/marketing/social-posts/{post.id}/cancel/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ANNULE')

    def test_commercial_sees_only_own_posts(self):
        own = SocialPost.objects.create(title='Mine', content='C', platform='FACEBOOK', author=self.commercial)
        SocialPost.objects.create(title='Other', content='C', platform='FACEBOOK', author=self.marketing_user)
        ids = [p['id'] for p in self.client_commercial.get('/api/v1/marketing/social-posts/').json()['results']]
        self.assertEqual(ids, [str(own.id)])


class MarketingDashboardTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='marketing@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.commercial = User.objects.create(email='commercial@sokensdigital.com', first_name='Commercial')
        _give_role(self.commercial, ROLE_COMMERCIAL)

        self.outsider = User.objects.create(email='dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        Lead.objects.create(
            first_name='Ada', last_name='Lovelace', email='ada@example.com', source='SITE_WEB',
            status='QUALIFIE', qualification_score=50, estimated_value=Decimal('10000'),
            assigned_to=self.commercial,
        )
        Lead.objects.create(
            first_name='Grace', last_name='Hopper', email='grace@example.com', source='SITE_WEB',
            status='PERDU', qualification_score=90, estimated_value=Decimal('99999'),
        )

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)

        self.client_commercial = APIClient()
        self.client_commercial.force_authenticate(user=self.commercial)

        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def test_weighted_pipeline_excludes_closed_leads(self):
        response = self.client_marketing.get('/api/v1/marketing/dashboard/')
        self.assertEqual(response.status_code, 200)
        # 10000 * 50/100 = 5000.00 — the PERDU lead is excluded entirely.
        self.assertEqual(response.json()['weighted_pipeline'], '5000.00')

    def test_commercial_scoped_to_own_leads(self):
        response = self.client_commercial.get('/api/v1/marketing/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['total_leads'], 1)

    def test_outsider_forbidden(self):
        response = self.client_outsider.get('/api/v1/marketing/dashboard/')
        self.assertEqual(response.status_code, 403)

    def test_super_admin_sees_all_leads(self):
        """Regression: marketing_dashboard() used to omit ROLE_SUPER_ADMIN
        from its own gate and scoping, despite its docstring promising
        Super-Admin the same unscoped view as Responsable Marketing."""
        super_admin = User.objects.create(email='super-dash@sokensdigital.com', first_name='Super')
        _give_role(super_admin, ROLE_SUPER_ADMIN)
        client = APIClient()
        client.force_authenticate(user=super_admin)
        response = client.get('/api/v1/marketing/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['total_leads'], 2)

    def test_conversion_rate_computed(self):
        Lead.objects.create(
            first_name='Alan', last_name='Turing', email='alan@example.com', source='SITE_WEB',
            status='CONVERTI', qualification_score=100, estimated_value=Decimal('5000'),
        )
        response = self.client_marketing.get('/api/v1/marketing/dashboard/')
        # 1 converted out of 3 leads total = 33.3%
        self.assertEqual(response.json()['conversion_rate'], '33.3')

    def test_leads_over_time_is_30_day_zero_filled_series(self):
        response = self.client_marketing.get('/api/v1/marketing/dashboard/')
        series = response.json()['leads_over_time']
        self.assertEqual(len(series), 30)
        self.assertEqual(series[-1]['date'], timezone.now().date().isoformat())
        # Both seed leads were created "today" by create() — should show up
        # on the last day of the series.
        self.assertEqual(series[-1]['count'], 2)


class QuoteViewSetTests(APITestCase):
    def setUp(self):
        self.commercial_a = User.objects.create(email='commercial-a@sokensdigital.com', first_name='CommercialA')
        _give_role(self.commercial_a, ROLE_COMMERCIAL)

        self.commercial_b = User.objects.create(email='commercial-b@sokensdigital.com', first_name='CommercialB')
        _give_role(self.commercial_b, ROLE_COMMERCIAL)

        self.chef_projet = User.objects.create(email='chef@sokensdigital.com', first_name='Chef')
        _give_role(self.chef_projet, ROLE_PROJECT_MANAGER)

        self.super_admin = User.objects.create(email='super@sokensdigital.com', first_name='Super')
        _give_role(self.super_admin, ROLE_SUPER_ADMIN)

        self.outsider = User.objects.create(email='dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.commercial_a)

        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.commercial_b)

        self.client_chef = APIClient()
        self.client_chef.force_authenticate(user=self.chef_projet)

        self.client_super = APIClient()
        self.client_super.force_authenticate(user=self.super_admin)

        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def payload(self, **overrides):
        data = {
            'lines': [
                {'service_title': 'Développement app', 'quantity': '10', 'unit_price': '500.00'},
                {'service_title': 'Design UI', 'quantity': '5', 'unit_price': '200.00'},
            ],
        }
        data.update(overrides)
        return data

    def test_commercial_can_create_quote_with_computed_totals(self):
        response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['status'], 'BROUILLON')
        # 10*500 + 5*200 = 6000 HT, TTC = 6000 * 1.18 = 7080.00
        self.assertEqual(body['total_ht'], '6000.00')
        self.assertEqual(body['total_ttc'], '7080.00')
        self.assertTrue(body['quote_number'].startswith('DEV-'))

    def test_outsider_forbidden(self):
        response = self.client_outsider.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        self.assertEqual(response.status_code, 403)

    def test_chef_de_projet_can_read_but_not_create(self):
        quote = Quote.objects.create(created_by=self.commercial_a)
        response = self.client_chef.get(f'/api/v1/marketing/quotes/{quote.id}/')
        self.assertEqual(response.status_code, 200)
        response = self.client_chef.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        self.assertEqual(response.status_code, 403)

    def test_commercial_sees_only_own_quotes(self):
        own = Quote.objects.create(created_by=self.commercial_a)
        Quote.objects.create(created_by=self.commercial_b)
        ids = [q['id'] for q in self.client_a.get('/api/v1/marketing/quotes/').json()['results']]
        self.assertEqual(ids, [str(own.id)])

    def test_commercial_cannot_access_other_commercials_quote(self):
        other = Quote.objects.create(created_by=self.commercial_b)
        response = self.client_a.get(f'/api/v1/marketing/quotes/{other.id}/')
        self.assertEqual(response.status_code, 404)  # filtered out of queryset — doesn't leak existence

    def test_super_admin_sees_all_quotes(self):
        Quote.objects.create(created_by=self.commercial_a)
        Quote.objects.create(created_by=self.commercial_b)
        response = self.client_super.get('/api/v1/marketing/quotes/')
        self.assertEqual(response.json()['count'], 2)

    def test_send_requires_at_least_one_line(self):
        response = self.client_a.post('/api/v1/marketing/quotes/', {'lines': []}, format='json')
        quote_id = response.json()['id']
        send_response = self.client_a.post(f'/api/v1/marketing/quotes/{quote_id}/send/')
        self.assertEqual(send_response.status_code, 400)

    def test_owner_can_still_edit_after_sending(self):
        """The owning department can always edit and update a quote,
        whatever its status — no more BROUILLON-only lock."""
        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote_id = create_response.json()['id']

        send_response = self.client_a.post(f'/api/v1/marketing/quotes/{quote_id}/send/')
        self.assertEqual(send_response.status_code, 200)
        self.assertEqual(send_response.json()['status'], 'ENVOYE')

        edit_response = self.client_a.patch(
            f'/api/v1/marketing/quotes/{quote_id}/', {'discount_amount': '100'}, format='json',
        )
        self.assertEqual(edit_response.status_code, 200)
        self.assertEqual(edit_response.json()['discount_amount'], '100.00')

    def test_marketing_can_edit_any_quote_including_other_commercials(self):
        marketing_user = User.objects.create(email='marketing-devis@sokensdigital.com', first_name='Marketing')
        _give_role(marketing_user, ROLE_RESPONSABLE_MARKETING)
        client_marketing = APIClient()
        client_marketing.force_authenticate(user=marketing_user)

        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote_id = create_response.json()['id']

        response = client_marketing.patch(
            f'/api/v1/marketing/quotes/{quote_id}/', {'discount_amount': '50'}, format='json',
        )
        self.assertEqual(response.status_code, 200)

    def test_commercial_still_cannot_edit_another_commercials_quote(self):
        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote_id = create_response.json()['id']
        response = self.client_b.patch(
            f'/api/v1/marketing/quotes/{quote_id}/', {'discount_amount': '50'}, format='json',
        )
        # 404, not 403 — get_queryset() already scopes a Commercial-only
        # user to their own quotes, so another commercial's quote is
        # filtered out before the object-permission check even runs
        # (same reasoning as test_commercial_cannot_access_other_commercials_quote).
        self.assertEqual(response.status_code, 404)

    def test_clone_creates_new_editable_version(self):
        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote_id = create_response.json()['id']
        self.client_a.post(f'/api/v1/marketing/quotes/{quote_id}/send/')

        clone_response = self.client_a.post(f'/api/v1/marketing/quotes/{quote_id}/clone/')
        self.assertEqual(clone_response.status_code, 201)
        cloned = clone_response.json()
        self.assertEqual(cloned['status'], 'BROUILLON')
        self.assertEqual(cloned['version'], 2)
        self.assertEqual(cloned['total_ht'], '6000.00')
        self.assertEqual(len(cloned['lines']), 2)

    def test_public_tracking_records_opened_at_once(self):
        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote_id = create_response.json()['id']
        quote = Quote.objects.get(id=quote_id)
        self.assertIsNone(quote.opened_at)

        anon = APIClient()
        response = anon.get(f'/api/v1/public/quotes/track/{quote.tracking_token}/')
        self.assertEqual(response.status_code, 200)
        quote.refresh_from_db()
        first_open = quote.opened_at
        self.assertIsNotNone(first_open)

        anon.get(f'/api/v1/public/quotes/track/{quote.tracking_token}/')
        quote.refresh_from_db()
        self.assertEqual(quote.opened_at, first_open)  # unchanged on second view

    def test_public_tracking_hides_internal_fields(self):
        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote = Quote.objects.get(id=create_response.json()['id'])
        anon = APIClient()
        body = anon.get(f'/api/v1/public/quotes/track/{quote.tracking_token}/').json()
        self.assertNotIn('created_by', body)
        self.assertNotIn('tracking_token', body)

    def test_new_quote_copies_default_payment_terms_from_settings(self):
        # 0021_seed_quote_settings already seeded default_payment_terms.
        response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201)
        terms = response.json()['payment_terms']
        self.assertEqual(len(terms), 3)
        self.assertEqual(terms[0]['label'], 'Acompte à la commande')

    def test_custom_payment_terms_override_the_default(self):
        response = self.client_a.post(
            '/api/v1/marketing/quotes/',
            self.payload(payment_terms=[{'label': 'Comptant', 'percentage': 100}]),
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['payment_terms'], [{'label': 'Comptant', 'percentage': 100}])

    def test_line_amount_label_and_description_round_trip(self):
        response = self.client_a.post(
            '/api/v1/marketing/quotes/',
            self.payload(lines=[
                {'service_title': 'Formation', 'description': 'Séance d\'accompagnement.', 'quantity': '1', 'unit_price': '0', 'amount_label': 'Offert'},
            ]),
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        line = response.json()['lines'][0]
        self.assertEqual(line['amount_label'], 'Offert')
        self.assertEqual(line['description'], "Séance d'accompagnement.")

    def _accepted_quote(self):
        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote = Quote.objects.get(id=create_response.json()['id'])
        quote.status = Quote.Status.ACCEPTE
        quote.save(update_fields=['status'])
        return quote

    def test_convert_accepted_quote_to_invoice(self):
        quote = self._accepted_quote()
        response = self.client_a.post(f'/api/v1/marketing/quotes/{quote.id}/convert-to-invoice/')
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['quote'], str(quote.id))
        self.assertEqual(body['amount_ht'], '6000.00')
        self.assertTrue(body['invoice_number'].startswith('FAC-'))

    def test_cannot_convert_a_draft_quote(self):
        create_response = self.client_a.post('/api/v1/marketing/quotes/', self.payload(), format='json')
        quote_id = create_response.json()['id']
        response = self.client_a.post(f'/api/v1/marketing/quotes/{quote_id}/convert-to-invoice/')
        self.assertEqual(response.status_code, 400)

    def test_cannot_convert_twice(self):
        quote = self._accepted_quote()
        self.client_a.post(f'/api/v1/marketing/quotes/{quote.id}/convert-to-invoice/')
        response = self.client_a.post(f'/api/v1/marketing/quotes/{quote.id}/convert-to-invoice/')
        self.assertEqual(response.status_code, 400)

    def test_outsider_cannot_convert(self):
        quote = self._accepted_quote()
        response = self.client_outsider.post(f'/api/v1/marketing/quotes/{quote.id}/convert-to-invoice/')
        self.assertEqual(response.status_code, 403)


def _signature_data_url() -> str:
    import base64
    buffer = io.BytesIO()
    Image.new('RGBA', (10, 10), color=(0, 0, 0, 0)).save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()


class PublicQuoteAcceptViewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.commercial = User.objects.create(email='commercial-accept@sokensdigital.com', first_name='Commercial')
        _give_role(self.commercial, ROLE_COMMERCIAL)
        self.quote = Quote.objects.create(
            created_by=self.commercial, client_name='Client X', status=Quote.Status.ENVOYE,
        )

    @patch('core.storage._bucket_ensured', False)
    @patch.dict('os.environ', {'SUPABASE_URL': 'https://test-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'test-key'})
    @patch('core.storage._session.post')
    def test_accept_sets_signed_at_ip_and_signature(self, mock_post):
        mock_post.side_effect = [
            Mock(status_code=200, text='{}'),  # bucket ensure
            Mock(status_code=200, text='{}'),  # object upload
        ]
        anon = APIClient()
        response = anon.post(
            f'/api/v1/public/quotes/track/{self.quote.tracking_token}/accept/',
            {'signature': _signature_data_url()},
            format='json',
            REMOTE_ADDR='203.0.113.5',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ACCEPTE')
        self.assertTrue(response.json()['signature_url'])
        self.quote.refresh_from_db()
        self.assertIsNotNone(self.quote.signed_at)
        self.assertEqual(self.quote.accepted_ip, '203.0.113.5')
        self.assertTrue(self.quote.signature_url)

    def test_accept_without_signature_is_rejected(self):
        anon = APIClient()
        response = anon.post(f'/api/v1/public/quotes/track/{self.quote.tracking_token}/accept/')
        self.assertEqual(response.status_code, 400)
        self.quote.refresh_from_db()
        self.assertEqual(self.quote.status, Quote.Status.ENVOYE)

    def test_cannot_accept_a_draft_quote(self):
        self.quote.status = Quote.Status.BROUILLON
        self.quote.save(update_fields=['status'])
        anon = APIClient()
        response = anon.post(
            f'/api/v1/public/quotes/track/{self.quote.tracking_token}/accept/',
            {'signature': _signature_data_url()}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    @patch('core.storage._bucket_ensured', False)
    @patch.dict('os.environ', {'SUPABASE_URL': 'https://test-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'test-key'})
    @patch('core.storage._session.post')
    def test_accepting_twice_is_idempotent(self, mock_post):
        mock_post.side_effect = [
            Mock(status_code=200, text='{}'),
            Mock(status_code=200, text='{}'),
        ]
        anon = APIClient()
        anon.post(
            f'/api/v1/public/quotes/track/{self.quote.tracking_token}/accept/',
            {'signature': _signature_data_url()}, format='json',
        )
        # Already ACCEPTE — the view returns early before re-validating the
        # signature, so a second call (even without one) must still succeed.
        response = anon.post(f'/api/v1/public/quotes/track/{self.quote.tracking_token}/accept/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ACCEPTE')


class QuoteSettingsViewTests(APITestCase):
    def setUp(self):
        self.commercial = User.objects.create(email='devis-commercial@sokensdigital.com', first_name='Commercial')
        _give_role(self.commercial, ROLE_COMMERCIAL)
        self.chef_projet = User.objects.create(email='devis-chef@sokensdigital.com', first_name='Chef')
        _give_role(self.chef_projet, ROLE_PROJECT_MANAGER)
        self.outsider = User.objects.create(email='devis-dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_commercial = APIClient()
        self.client_commercial.force_authenticate(user=self.commercial)
        self.client_chef = APIClient()
        self.client_chef.force_authenticate(user=self.chef_projet)
        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def test_commercial_can_read_and_update_settings(self):
        get_response = self.client_commercial.get('/api/v1/marketing/quote-settings/')
        self.assertEqual(get_response.status_code, 200)
        self.assertIn('default_payment_terms', get_response.json())

        patch_response = self.client_commercial.patch(
            '/api/v1/marketing/quote-settings/',
            {'footer_note': 'Nouvelle note.'},
            format='json',
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()['footer_note'], 'Nouvelle note.')

    def test_settings_are_a_singleton(self):
        first = self.client_commercial.get('/api/v1/marketing/quote-settings/').json()
        second = self.client_commercial.get('/api/v1/marketing/quote-settings/').json()
        self.assertEqual(first, second)
        from marketing.models import QuoteSettings
        self.assertEqual(QuoteSettings.objects.count(), 1)

    def test_chef_de_projet_can_read_but_not_update(self):
        self.assertEqual(self.client_chef.get('/api/v1/marketing/quote-settings/').status_code, 200)
        response = self.client_chef.patch('/api/v1/marketing/quote-settings/', {'footer_note': 'x'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_outsider_forbidden(self):
        self.assertEqual(self.client_outsider.get('/api/v1/marketing/quote-settings/').status_code, 403)


class PageSectionViewSetTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='marketing2@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.outsider = User.objects.create(email='dev4@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)

        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

        # The data migration (0006_seed_page_sections) already seeds one row
        # per (page, section_key) — update it rather than creating a
        # duplicate, since that pair is unique-constrained.
        self.hero = PageSection.objects.get(page='ACCUEIL', section_key='hero')
        self.hero.title = 'Titre initial'
        self.hero.items = [{'value': '150+', 'label': 'Projets livrés'}]
        self.hero.save(update_fields=['title', 'items'])

    def test_marketing_can_list_sections_for_a_page(self):
        response = self.client_marketing.get('/api/v1/marketing/cms/page-sections/?page=ACCUEIL')
        self.assertEqual(response.status_code, 200)
        # 8 sections seeded by the data migration (0006_seed_page_sections),
        # unpaginated (see PageSectionViewSet docstring).
        self.assertEqual(len(response.json()), 8)

    def test_expertise_and_tracking_pages_seeded(self):
        # 5 sections seeded by 0008_seed_expertise_and_tracking_sections.
        response = self.client_marketing.get('/api/v1/marketing/cms/page-sections/?page=EXPERTISE')
        self.assertEqual(len(response.json()), 5)
        # 2 sections.
        response = self.client_marketing.get('/api/v1/marketing/cms/page-sections/?page=SUIVI_PROJET')
        self.assertEqual(len(response.json()), 2)

    def test_outsider_forbidden(self):
        response = self.client_outsider.get('/api/v1/marketing/cms/page-sections/?page=ACCUEIL')
        self.assertEqual(response.status_code, 403)

    def test_marketing_can_edit_section_content(self):
        response = self.client_marketing.patch(
            f'/api/v1/marketing/cms/page-sections/{self.hero.id}/',
            {'title': 'Nouveau titre', 'items': [{'value': '200+', 'label': 'Projets livrés'}]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.hero.refresh_from_db()
        self.assertEqual(self.hero.title, 'Nouveau titre')
        self.assertEqual(self.hero.items[0]['value'], '200+')

    def test_page_and_section_key_are_read_only(self):
        response = self.client_marketing.patch(
            f'/api/v1/marketing/cms/page-sections/{self.hero.id}/',
            {'page': 'EXPERTISE', 'section_key': 'cta'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.hero.refresh_from_db()
        self.assertEqual(self.hero.page, 'ACCUEIL')
        self.assertEqual(self.hero.section_key, 'hero')

    def test_put_not_allowed(self):
        response = self.client_marketing.put(
            f'/api/v1/marketing/cms/page-sections/{self.hero.id}/', {'title': 'X'}, format='json',
        )
        self.assertEqual(response.status_code, 405)

    def test_public_endpoint_returns_only_active_sections_for_requested_page(self):
        PageSection.objects.filter(page='ACCUEIL', section_key='cta').update(is_active=False)
        anon = APIClient()
        response = anon.get('/api/v1/public/cms/page-sections/?page=ACCUEIL')
        self.assertEqual(response.status_code, 200)
        keys = [row['section_key'] for row in response.json()]
        self.assertIn('hero', keys)
        self.assertNotIn('cta', keys)

    def test_public_endpoint_requires_page_param(self):
        anon = APIClient()
        response = anon.get('/api/v1/public/cms/page-sections/')
        self.assertEqual(response.json(), [])

    def test_public_endpoint_hides_id_and_is_active(self):
        anon = APIClient()
        body = anon.get('/api/v1/public/cms/page-sections/?page=ACCUEIL').json()
        self.assertNotIn('id', body[0])
        self.assertNotIn('is_active', body[0])


class ImageUploadViewTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='uploadmkt@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)
        self.outsider = User.objects.create(email='uploaddev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)
        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def image_file(self, content_type='image/png', name='logo.png', size=None):
        # `size` (oversized-rejection test): garbage bytes are fine — the
        # size check runs before anything tries to decode them as an image.
        if size is not None:
            content = b'\x00' * size
        else:
            buffer = io.BytesIO()
            Image.new('RGB', (10, 10), color='red').save(buffer, format='PNG')
            content = buffer.getvalue()
        return SimpleUploadedFile(name, content, content_type=content_type)

    @patch('core.storage._bucket_ensured', False)
    @patch.dict('os.environ', {'SUPABASE_URL': 'https://test-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'test-key'})
    @patch('core.storage._session.post')
    def test_marketing_can_upload_image(self, mock_post):
        mock_post.side_effect = [
            Mock(status_code=200, text='{}'),  # bucket ensure
            Mock(status_code=200, text='{}'),  # object upload
        ]
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/upload-image/', {'file': self.image_file()}, format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()['url'].startswith('https://test-project.supabase.co/storage/v1/object/public/site-content/page-sections/'))

    def test_outsider_forbidden(self):
        response = self.client_outsider.post(
            '/api/v1/marketing/cms/upload-image/', {'file': self.image_file()}, format='multipart',
        )
        self.assertEqual(response.status_code, 403)

    def test_no_file_rejected(self):
        response = self.client_marketing.post('/api/v1/marketing/cms/upload-image/', {}, format='multipart')
        self.assertEqual(response.status_code, 400)

    def test_wrong_content_type_rejected(self):
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/upload-image/',
            {'file': self.image_file(content_type='application/pdf', name='doc.pdf')},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)

    def test_oversized_file_rejected(self):
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/upload-image/',
            {'file': self.image_file(size=6 * 1024 * 1024)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)

    @patch('core.storage._bucket_ensured', False)
    @patch.dict('os.environ', {'SUPABASE_URL': 'https://test-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'test-key'})
    @patch('core.storage._session.post')
    def test_supabase_failure_returns_502(self, mock_post):
        mock_post.side_effect = [
            Mock(status_code=200, text='{}'),
            Mock(status_code=500, text='internal error'),
        ]
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/upload-image/', {'file': self.image_file()}, format='multipart',
        )
        self.assertEqual(response.status_code, 502)


class VideoUploadViewTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='uploadvidmkt@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)
        self.outsider = User.objects.create(email='uploadviddev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)
        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def video_file(self, content_type='video/mp4', name='demo.mp4', size=100):
        return SimpleUploadedFile(name, b'\x00' * size, content_type=content_type)

    @patch('core.storage._bucket_ensured', False)
    @patch.dict('os.environ', {'SUPABASE_URL': 'https://test-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'test-key'})
    @patch('core.storage._session.post')
    def test_marketing_can_upload_video(self, mock_post):
        mock_post.side_effect = [
            Mock(status_code=200, text='{}'),
            Mock(status_code=200, text='{}'),
        ]
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/upload-video/', {'file': self.video_file()}, format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()['url'].startswith('https://test-project.supabase.co/storage/v1/object/public/site-content/showcase-projects/'))

    def test_outsider_forbidden(self):
        response = self.client_outsider.post(
            '/api/v1/marketing/cms/upload-video/', {'file': self.video_file()}, format='multipart',
        )
        self.assertEqual(response.status_code, 403)

    def test_image_content_type_rejected(self):
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/upload-video/',
            {'file': self.video_file(content_type='image/png', name='logo.png')},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)

    def test_oversized_file_rejected(self):
        response = self.client_marketing.post(
            '/api/v1/marketing/cms/upload-video/',
            {'file': self.video_file(size=26 * 1024 * 1024)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)


class SiteSettingsViewTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='chrome-mkt@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)
        self.outsider = User.objects.create(email='chrome-dev@sokensdigital.com', first_name='Dev')
        _give_role(self.outsider, ROLE_DEVELOPER)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)
        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def test_public_can_read_settings(self):
        anon = APIClient()
        response = anon.get('/api/v1/public/site-settings/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('services_links', response.json())

    def test_settings_are_a_singleton(self):
        anon = APIClient()
        first = anon.get('/api/v1/public/site-settings/').json()
        second = anon.get('/api/v1/public/site-settings/').json()
        self.assertEqual(first, second)
        from marketing.models import SiteSettings
        self.assertEqual(SiteSettings.objects.count(), 1)

    def test_marketing_can_update_settings(self):
        response = self.client_marketing.patch(
            '/api/v1/marketing/cms/site-settings/',
            {'tagline': 'Nouvelle signature.', 'services_links': [{'label': 'Audit'}]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['tagline'], 'Nouvelle signature.')

        anon = APIClient()
        public = anon.get('/api/v1/public/site-settings/').json()
        self.assertEqual(public['tagline'], 'Nouvelle signature.')
        self.assertEqual(public['services_links'], [{'label': 'Audit'}])

    def test_outsider_cannot_update_settings(self):
        response = self.client_outsider.patch(
            '/api/v1/marketing/cms/site-settings/', {'tagline': 'Hack'}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_update_settings(self):
        anon = APIClient()
        response = anon.patch('/api/v1/marketing/cms/site-settings/', {'tagline': 'Hack'}, format='json')
        self.assertIn(response.status_code, (401, 403))


def _mock_response(status_code=200, json_data=None):
    response = Mock()
    response.status_code = status_code
    response.json.return_value = json_data or {}
    response.text = str(json_data)
    return response


class FacebookPublishingTests(TestCase):
    """marketing/publishing.py — no real Graph API calls happen here:
    requests.post is mocked throughout. Credentials come from
    SocialMediaCredentials (configured via Paramètres), not settings —
    blank by default, so the "not configured" path is exactly what runs
    today, in production, until a Super-Admin fills in the form."""

    def test_raises_not_configured_when_credentials_are_blank(self):
        from marketing.publishing import PublishingNotConfiguredError, publish_to_facebook

        post = SocialPost(title='x', content='hello', platform=SocialPost.Platform.FACEBOOK)
        with self.assertRaises(PublishingNotConfiguredError):
            publish_to_facebook(post)

    def test_text_only_post_uses_feed_endpoint(self):
        from marketing.models import SocialMediaCredentials
        from marketing.publishing import publish_to_facebook

        SocialMediaCredentials.objects.create(facebook_page_id='999', facebook_access_token='tok')
        post = SocialPost(title='x', content='Bonjour Facebook', platform=SocialPost.Platform.FACEBOOK)
        with patch('marketing.publishing.requests.post') as mock_post:
            mock_post.return_value = _mock_response(200, {'id': '999_111'})
            url = publish_to_facebook(post)

        called_url = mock_post.call_args.args[0]
        self.assertTrue(called_url.endswith('/999/feed'))
        self.assertEqual(mock_post.call_args.kwargs['data']['message'], 'Bonjour Facebook')
        self.assertEqual(url, 'https://www.facebook.com/999_111')

    def test_post_with_image_uses_photos_endpoint(self):
        from marketing.models import SocialMediaCredentials
        from marketing.publishing import publish_to_facebook

        SocialMediaCredentials.objects.create(facebook_page_id='999', facebook_access_token='tok')
        post = SocialPost(
            title='x', content='Regardez', platform=SocialPost.Platform.FACEBOOK,
            image_path='https://example.com/pic.jpg',
        )
        with patch('marketing.publishing.requests.post') as mock_post:
            mock_post.return_value = _mock_response(200, {'id': 'photo1', 'post_id': '999_222'})
            url = publish_to_facebook(post)

        called_url = mock_post.call_args.args[0]
        self.assertTrue(called_url.endswith('/999/photos'))
        self.assertEqual(mock_post.call_args.kwargs['data']['url'], 'https://example.com/pic.jpg')
        self.assertEqual(url, 'https://www.facebook.com/999_222')

    def test_api_error_raises_publishing_error(self):
        from marketing.models import SocialMediaCredentials
        from marketing.publishing import PublishingError, publish_to_facebook

        SocialMediaCredentials.objects.create(facebook_page_id='999', facebook_access_token='tok')
        post = SocialPost(title='x', content='hello', platform=SocialPost.Platform.FACEBOOK)
        with patch('marketing.publishing.requests.post') as mock_post:
            mock_post.return_value = _mock_response(400, {'error': {'message': 'Invalid token'}})
            with self.assertRaises(PublishingError):
                publish_to_facebook(post)


class InstagramPublishingTests(TestCase):
    """A single image posts directly; more than one posts as a real
    carousel (child containers, then a parent CAROUSEL container) — see
    marketing/publishing.py::publish_to_instagram."""

    def _credentials(self):
        from marketing.models import SocialMediaCredentials
        return SocialMediaCredentials.objects.create(
            instagram_business_account_id='ig123', facebook_access_token='tok',
        )

    def test_raises_not_configured_when_credentials_are_blank(self):
        from marketing.publishing import PublishingNotConfiguredError, publish_to_instagram

        post = SocialPost(title='x', content='hello', platform=SocialPost.Platform.INSTAGRAM, image_path='https://example.com/a.jpg')
        with self.assertRaises(PublishingNotConfiguredError):
            publish_to_instagram(post)

    def test_single_image_posts_directly(self):
        from marketing.publishing import publish_to_instagram

        self._credentials()
        post = SocialPost(
            title='x', content='Regardez', platform=SocialPost.Platform.INSTAGRAM,
            image_path='https://example.com/a.jpg',
        )
        with patch('marketing.publishing.requests.post') as mock_post, \
                patch('marketing.publishing.requests.get') as mock_get:
            mock_post.side_effect = [
                _mock_response(200, {'id': 'container1'}),
                _mock_response(200, {'id': 'media1'}),
            ]
            mock_get.return_value = _mock_response(200, {'permalink': 'https://www.instagram.com/p/abc/'})
            url = publish_to_instagram(post)

        self.assertEqual(mock_post.call_count, 2)
        first_call_kwargs = mock_post.call_args_list[0].kwargs
        self.assertEqual(first_call_kwargs['data']['image_url'], 'https://example.com/a.jpg')
        self.assertNotIn('is_carousel_item', first_call_kwargs['data'])
        self.assertEqual(url, 'https://www.instagram.com/p/abc/')

    def test_multiple_images_post_as_carousel(self):
        from marketing.publishing import publish_to_instagram

        self._credentials()
        post = SocialPost(
            title='x', content='Regardez', platform=SocialPost.Platform.INSTAGRAM,
            image_path='https://example.com/a.jpg', additional_images=['https://example.com/b.jpg'],
        )
        with patch('marketing.publishing.requests.post') as mock_post, \
                patch('marketing.publishing.requests.get') as mock_get:
            mock_post.side_effect = [
                _mock_response(200, {'id': 'child1'}),
                _mock_response(200, {'id': 'child2'}),
                _mock_response(200, {'id': 'carousel1'}),
                _mock_response(200, {'id': 'media1'}),
            ]
            mock_get.return_value = _mock_response(200, {'permalink': 'https://www.instagram.com/p/xyz/'})
            url = publish_to_instagram(post)

        self.assertEqual(mock_post.call_count, 4)
        carousel_call_kwargs = mock_post.call_args_list[2].kwargs
        self.assertEqual(carousel_call_kwargs['data']['media_type'], 'CAROUSEL')
        self.assertEqual(carousel_call_kwargs['data']['children'], 'child1,child2')
        self.assertEqual(url, 'https://www.instagram.com/p/xyz/')

    def test_requires_at_least_one_image(self):
        from marketing.publishing import PublishingError, publish_to_instagram

        self._credentials()
        post = SocialPost(title='x', content='hello', platform=SocialPost.Platform.INSTAGRAM)
        with self.assertRaises(PublishingError):
            publish_to_instagram(post)


class RunScheduledPublishingTests(TestCase):
    def setUp(self):
        self.past = timezone.now() - timezone.timedelta(hours=1)
        self.future = timezone.now() + timezone.timedelta(hours=1)

    def _facebook_credentials(self):
        from marketing.models import SocialMediaCredentials
        return SocialMediaCredentials.objects.create(facebook_page_id='999', facebook_access_token='tok')

    def test_skips_everything_when_not_configured(self):
        from marketing.publishing import run_scheduled_publishing

        post = SocialPost.objects.create(
            title='x', content='hello', platform=SocialPost.Platform.FACEBOOK,
            status=SocialPost.Status.PROGRAMME, scheduled_at=self.past,
        )
        results = run_scheduled_publishing()
        self.assertEqual(results, [])
        post.refresh_from_db()
        self.assertEqual(post.status, SocialPost.Status.PROGRAMME)

    def test_publishes_due_facebook_posts(self):
        from marketing.publishing import run_scheduled_publishing

        self._facebook_credentials()
        post = SocialPost.objects.create(
            title='x', content='hello', platform=SocialPost.Platform.FACEBOOK,
            status=SocialPost.Status.PROGRAMME, scheduled_at=self.past,
        )
        with patch('marketing.publishing.requests.post') as mock_post:
            mock_post.return_value = _mock_response(200, {'id': '999_333'})
            results = run_scheduled_publishing()

        self.assertEqual(len(results), 1)
        post.refresh_from_db()
        self.assertEqual(post.status, SocialPost.Status.PUBLIE)
        self.assertEqual(post.post_url, 'https://www.facebook.com/999_333')
        self.assertIsNotNone(post.published_at)

    def test_marks_failed_on_api_error_with_note(self):
        from marketing.publishing import run_scheduled_publishing

        self._facebook_credentials()
        post = SocialPost.objects.create(
            title='x', content='hello', platform=SocialPost.Platform.FACEBOOK,
            status=SocialPost.Status.PROGRAMME, scheduled_at=self.past,
        )
        with patch('marketing.publishing.requests.post') as mock_post:
            mock_post.return_value = _mock_response(400, {'error': {'message': 'Invalid token'}})
            run_scheduled_publishing()

        post.refresh_from_db()
        self.assertEqual(post.status, SocialPost.Status.ECHEC)
        self.assertIn('Invalid token', post.notes)

    def test_ignores_posts_not_due_yet(self):
        from marketing.publishing import run_scheduled_publishing

        self._facebook_credentials()
        post = SocialPost.objects.create(
            title='x', content='hello', platform=SocialPost.Platform.FACEBOOK,
            status=SocialPost.Status.PROGRAMME, scheduled_at=self.future,
        )
        with patch('marketing.publishing.requests.post') as mock_post:
            run_scheduled_publishing()
        mock_post.assert_not_called()
        post.refresh_from_db()
        self.assertEqual(post.status, SocialPost.Status.PROGRAMME)


class PublishScheduledPostsCommandTests(TestCase):
    def test_command_runs_and_reports_when_nothing_is_due(self):
        from django.core.management import call_command

        out = io.StringIO()
        call_command('publish_scheduled_posts', stdout=out)
        self.assertIn('Aucune publication', out.getvalue())


class SocialMediaCredentialsViewTests(APITestCase):
    def setUp(self):
        self.super_admin = User.objects.create(email='admin@sokensdigital.com', first_name='Admin')
        _give_role(self.super_admin, ROLE_SUPER_ADMIN)

        self.marketing_user = User.objects.create(email='marketing2@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.client_admin = APIClient()
        self.client_admin.force_authenticate(user=self.super_admin)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)

    def test_super_admin_can_read_and_write(self):
        response = self.client_admin.patch(
            '/api/v1/marketing/social-media-credentials/',
            {'facebook_page_id': '123', 'facebook_access_token': 'secret-token'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['facebook_configured'])
        self.assertNotIn('facebook_access_token', response.json())

    def test_responsable_marketing_forbidden(self):
        response = self.client_marketing.get('/api/v1/marketing/social-media-credentials/')
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_forbidden(self):
        response = APIClient().get('/api/v1/marketing/social-media-credentials/')
        self.assertIn(response.status_code, (401, 403))


class SpecificationViewSetTests(APITestCase):
    def setUp(self):
        self.marketing_user = User.objects.create(email='marketing-spec@sokensdigital.com', first_name='Marketing')
        _give_role(self.marketing_user, ROLE_RESPONSABLE_MARKETING)

        self.chef_projet = User.objects.create(email='chef-spec@sokensdigital.com', first_name='Chef')
        _give_role(self.chef_projet, ROLE_PROJECT_MANAGER)

        self.developer = User.objects.create(email='dev-spec@sokensdigital.com', first_name='Dev')
        _give_role(self.developer, ROLE_DEVELOPER)

        self.outsider = User.objects.create(email='outsider-spec@sokensdigital.com', first_name='Outsider')
        _give_role(self.outsider, ROLE_COMMERCIAL)

        self.client_marketing = APIClient()
        self.client_marketing.force_authenticate(user=self.marketing_user)
        self.client_chef = APIClient()
        self.client_chef.force_authenticate(user=self.chef_projet)
        self.client_dev = APIClient()
        self.client_dev.force_authenticate(user=self.developer)
        self.client_outsider = APIClient()
        self.client_outsider.force_authenticate(user=self.outsider)

    def payload(self, **overrides):
        data = {
            'spec_type': 'FONCTIONNEL',
            'title': 'Espace client',
            'lines': [
                {'interface_name': "Page d'accueil", 'objective': "Présenter l'offre en un coup d'œil."},
            ],
        }
        data.update(overrides)
        return data

    def test_marketing_can_create_functional_spec(self):
        response = self.client_marketing.post('/api/v1/marketing/specifications/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body['spec_number'].startswith('CDF-'))
        self.assertEqual(body['status'], 'BROUILLON')
        self.assertEqual(len(body['lines']), 1)

    def test_technical_spec_gets_different_prefix(self):
        response = self.client_dev.post(
            '/api/v1/marketing/specifications/', self.payload(spec_type='TECHNIQUE'), format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()['spec_number'].startswith('CDT-'))

    def test_chef_de_projet_can_create_and_edit(self):
        create_response = self.client_chef.post('/api/v1/marketing/specifications/', self.payload(), format='json')
        self.assertEqual(create_response.status_code, 201)
        spec_id = create_response.json()['id']
        edit_response = self.client_chef.patch(
            f'/api/v1/marketing/specifications/{spec_id}/', {'title': 'Espace client v2'}, format='json',
        )
        self.assertEqual(edit_response.status_code, 200)
        self.assertEqual(edit_response.json()['title'], 'Espace client v2')

    def test_any_editor_can_edit_anothers_spec(self):
        """Collaborative document — no per-owner restriction, unlike Quote."""
        create_response = self.client_marketing.post('/api/v1/marketing/specifications/', self.payload(), format='json')
        spec_id = create_response.json()['id']
        response = self.client_dev.patch(
            f'/api/v1/marketing/specifications/{spec_id}/', {'status': 'FINALISE'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'FINALISE')

    def test_outsider_forbidden(self):
        response = self.client_outsider.post('/api/v1/marketing/specifications/', self.payload(), format='json')
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_forbidden(self):
        response = APIClient().get('/api/v1/marketing/specifications/')
        self.assertIn(response.status_code, (401, 403))

    def test_list_uses_lightweight_serializer(self):
        Specification.objects.create(spec_type='FONCTIONNEL', title='Test', created_by=self.marketing_user)
        response = self.client_marketing.get('/api/v1/marketing/specifications/')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('lines', response.json()['results'][0])
