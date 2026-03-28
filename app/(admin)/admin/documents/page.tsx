import { DocumentsAdminClient } from '@/components/admin/DocumentsAdminClient'
import { listAdminDocuments } from '@/lib/admin/data'

export default async function AdminDocumentsPage() {
  const documents = await listAdminDocuments()

  return <DocumentsAdminClient initialDocuments={documents} />
}
