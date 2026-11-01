-- ====================================================================
-- DispatchDesk Storage Migration: Freight Documents
-- Version: 1.0.0
-- Bucket: freight-documents (Private)
-- Path convention: <organization_id>/<load_id>/<filename>
-- ====================================================================

-- 1. Create the private freight-documents bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'freight-documents',
  'freight-documents',
  false,
  26214400, -- 25 MB max file size
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

-- 2. Helper function to extract and validate the organization UUID from storage path
-- Returns NULL if the first segment is not a valid UUID format
CREATE OR REPLACE FUNCTION public.get_storage_path_org_id(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  first_segment TEXT;
BEGIN
  IF object_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Extract the first path segment before the first '/'
  first_segment := split_part(object_name, '/', 1);
  
  -- Strict regex validation for standard UUID v4/v1
  IF first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  
  RETURN first_segment::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 3. Storage Object RLS Policies on storage.objects

-- Policy 1: SELECT (Read/Download)
-- Allows authenticated members to read/download documents strictly within their organizations
CREATE POLICY "freight_documents_select_policy"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'freight-documents'
    AND public.get_storage_path_org_id(name) IN (SELECT public.get_user_organizations())
  );

-- Policy 2: INSERT (Upload)
-- Allows authenticated members to upload documents strictly into their organization folder
CREATE POLICY "freight_documents_insert_policy"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'freight-documents'
    AND public.get_storage_path_org_id(name) IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(public.get_storage_path_org_id(name)) IS NOT NULL
  );

-- Policy 3: UPDATE
-- Allows dispatchers and owner_admins to update/replace document objects
CREATE POLICY "freight_documents_update_policy"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'freight-documents'
    AND public.has_operational_write_access(public.get_storage_path_org_id(name))
  )
  WITH CHECK (
    bucket_id = 'freight-documents'
    AND public.has_operational_write_access(public.get_storage_path_org_id(name))
  );

-- Policy 4: DELETE
-- Restricts document deletion strictly to organization owner_admins
CREATE POLICY "freight_documents_delete_policy"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'freight-documents'
    AND public.is_org_owner_admin(public.get_storage_path_org_id(name))
  );
