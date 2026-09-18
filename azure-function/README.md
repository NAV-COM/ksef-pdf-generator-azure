# Azure Function wrapper for KSeF PDF generator

This folder exposes the existing PDF generator as Azure Functions v4 HTTP endpoints.

## Endpoints

- `POST /api/invoice/pdf` - invoice XML -> PDF
- `POST /api/upo/pdf` - UPO XML -> PDF
- `GET /api/health` - health check

The PDF endpoints use `authLevel: function`, so in Azure pass a function key (`?code=...` or `x-functions-key`).

## Invoice request: raw XML (recommended for Business Central)

Body: raw XML bytes, preferably `Content-Type: application/xml`.

Optional headers:

- `X-KSeF-Number`
- `X-KSeF-Acceptance-Date`
- `X-KSeF-QR-Code`
- `X-KSeF-QR2-Code`
- `X-KSeF-Watermark`

Optional query parameter: `fileName`.

Example:

```bash
curl -X POST "http://localhost:7071/api/invoice/pdf?fileName=faktura.pdf" \
  -H "Content-Type: application/xml" \
  -H "X-KSeF-Number: 5555555555-20250808-9231003CA67B-BE" \
  --data-binary "@../assets/invoice.xml" \
  --output faktura.pdf
```

## Invoice request: JSON

```json
{
  "xml": "<Faktura>...</Faktura>",
  "additionalData": {
    "nrKSeF": "...",
    "acDate": "23.06.2026",
    "qrCode": "https://...",
    "qr2Code": "https://...",
    "watermark": "TEST"
  },
  "fileName": "faktura.pdf"
}
```

## Local run

Requirements: Node.js 22 or 24, Azure Functions Core Tools v4, and Azurite (when using `UseDevelopmentStorage=true`).

```bash
cd azure-function
npm install
npm run build
cp local.settings.json.example local.settings.json
func start
```

The build intentionally bundles the repository's local TypeScript generator code into `dist/index.cjs`, while npm packages remain external dependencies.

## Deployment

Build before deployment:

```bash
cd azure-function
npm install
npm run build
```

The first `npm install` also creates `package-lock.json`; from then on CI/CD can use `npm ci`. Deploy the contents of the `azure-function` directory (including `dist`, `package.json`, `package-lock.json` when generated, and `host.json`). The Azure deployment process can install production dependencies.

For a new Function App use Azure Functions runtime 4.x and Node.js 22 or 24. Flex Consumption is a suitable serverless hosting plan.
