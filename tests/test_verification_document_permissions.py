"""Reglas de edición de documentos según el estado de verificación."""
import unittest

from app.models import ProfileStatus, UserRole, VerificationDocumentType
from app.routers.verification_router import REQUIRED, can_modify_document


class VerificationDocumentPermissionTests(unittest.TestCase):
    def test_caregiver_must_provide_identity_and_work_reference(self):
        self.assertEqual(
            REQUIRED[UserRole.caregiver],
            {
                VerificationDocumentType.identity,
                VerificationDocumentType.work_reference,
            },
        )

    def test_nurse_must_provide_all_review_documents(self):
        self.assertEqual(
            REQUIRED[UserRole.nurse],
            {
                VerificationDocumentType.identity,
                VerificationDocumentType.professional_license,
                VerificationDocumentType.nursing_degree,
            },
        )

    def test_pending_draft_allows_required_documents(self):
        self.assertTrue(can_modify_document(ProfileStatus.pending, None, VerificationDocumentType.identity))
        self.assertTrue(can_modify_document(ProfileStatus.pending, None, VerificationDocumentType.nursing_degree))

    def test_submitted_pending_request_allows_only_additional_certificates(self):
        submitted_at = object()
        self.assertTrue(can_modify_document(ProfileStatus.pending, submitted_at, VerificationDocumentType.additional_certificate))
        self.assertFalse(can_modify_document(ProfileStatus.pending, submitted_at, VerificationDocumentType.identity))
        self.assertFalse(can_modify_document(ProfileStatus.pending, submitted_at, VerificationDocumentType.nursing_degree))

    def test_approved_disallows_all_document_uploads(self):
        self.assertFalse(can_modify_document(ProfileStatus.approved, None, VerificationDocumentType.additional_certificate))

    def test_rejected_allows_corrections(self):
        self.assertTrue(can_modify_document(ProfileStatus.rejected, None, VerificationDocumentType.identity))

    def test_new_verification_is_a_draft_and_not_submitted(self):
        from app.models import ProfessionalVerification

        verification = ProfessionalVerification(user_id=1, role=UserRole.caregiver)

        self.assertEqual(verification.status, ProfileStatus.pending)
        self.assertIsNone(verification.submitted_at)


if __name__ == '__main__':
    unittest.main()