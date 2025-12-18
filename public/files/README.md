# Files Directory

This directory contains downloadable files for your portfolio.

## CV / Resume

**File:** `cv.pdf`

Replace this with your own CV/resume:
- **Format:** PDF (recommended for universal compatibility)
- **Naming:** Keep the filename as `cv.pdf` or update the reference in `profile.json`

**To update the filename:**

Edit `content/{lang}/profile.json`:

```json
{
  "personalInfo": {
    "cv": {
      "url": "/files/your-resume.pdf",
      "fileName": "Your Name - Resume.pdf"
    }
  }
}
```

The `fileName` is what users will see when downloading.

## Adding Other Files

You can add other downloadable files here:
- Certificates
- Portfolio documents
- Additional resources

Reference them in your content files using the `/files/` path.

