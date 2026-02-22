"""
Helpers for constructing file URLs returned by API responses.
"""


def build_protected_file_url(job_id: str, filename: str, file_access_token: str) -> str:
    return f"/files/{job_id}/{filename}?t={file_access_token}"


def build_authenticated_file_url(job_id: str, filename: str) -> str:
    return f"/files/{job_id}/{filename}"
