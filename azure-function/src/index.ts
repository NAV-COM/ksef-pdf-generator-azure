import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { generateInvoice } from '../../src/lib-public/generate-invoice';
import { generatePDFUPO } from '../../src/lib-public/UPO-generator';
import { AdditionalDataTypes } from '../../src/lib-public/types/common.types';
import { XmlInput } from '../../src/shared/XML-parser';

interface InvoiceJsonRequest {
  xml: string;
  additionalData?: Partial<AdditionalDataTypes>;
  fileName?: string;
}

class BadRequestError extends Error {}

app.http('generateInvoicePdf', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'invoice/pdf',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const input = await readInvoiceRequest(request);
      const pdfBase64 = await generateInvoice(input.xml, input.additionalData, 'base64');
      const pdf = Buffer.from(pdfBase64, 'base64');

      context.log(`Generated invoice PDF (${pdf.length} bytes).`);

      return pdfResponse(pdf, input.fileName ?? 'invoice.pdf');
    } catch (error) {
      return errorResponse(error, context);
    }
  },
});

app.http('generateUpoPdf', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'upo/pdf',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const body = new Uint8Array(await request.arrayBuffer());

      if (body.length === 0) {
        throw new BadRequestError('Request body must contain UPO XML.');
      }

      const pdfBase64 = await generatePDFUPO(body, 'base64');
      const pdf = Buffer.from(pdfBase64, 'base64');
      const fileName = sanitizeFileName(request.query.get('fileName') ?? 'upo.pdf');

      context.log(`Generated UPO PDF (${pdf.length} bytes).`);

      return pdfResponse(pdf, fileName);
    } catch (error) {
      return errorResponse(error, context);
    }
  },
});

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (): Promise<HttpResponseInit> => ({
    status: 200,
    jsonBody: {
      status: 'ok',
      node: process.version,
    },
  }),
});

async function readInvoiceRequest(
  request: HttpRequest
): Promise<{ xml: XmlInput; additionalData: AdditionalDataTypes; fileName?: string }> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as Partial<InvoiceJsonRequest>;

    if (!payload || typeof payload.xml !== 'string' || payload.xml.trim().length === 0) {
      throw new BadRequestError('JSON body must contain a non-empty "xml" property.');
    }

    return {
      xml: payload.xml,
      additionalData: normalizeAdditionalData(payload.additionalData),
      fileName: payload.fileName ? sanitizeFileName(payload.fileName) : undefined,
    };
  }

  const bytes = new Uint8Array(await request.arrayBuffer());

  if (bytes.length === 0) {
    throw new BadRequestError('Request body must contain invoice XML.');
  }

  return {
    xml: bytes,
    additionalData: {
      nrKSeF: getRequestValue(request, 'x-ksef-number', 'nrKSeF') ?? '',
      acDate: getRequestValue(request, 'x-ksef-acceptance-date', 'acDate'),
      qrCode: getRequestValue(request, 'x-ksef-qr-code', 'qrCode'),
      qr2Code: getRequestValue(request, 'x-ksef-qr2-code', 'qr2Code'),
      watermark: getRequestValue(request, 'x-ksef-watermark', 'watermark'),
    },
    fileName: sanitizeFileName(request.query.get('fileName') ?? 'invoice.pdf'),
  };
}

function normalizeAdditionalData(data?: Partial<AdditionalDataTypes>): AdditionalDataTypes {
  return {
    nrKSeF: data?.nrKSeF ?? '',
    acDate: data?.acDate,
    qrCode: data?.qrCode,
    qr2Code: data?.qr2Code,
    isMobile: data?.isMobile,
    watermark: data?.watermark,
  };
}

function getRequestValue(request: HttpRequest, headerName: string, queryName: string): string | undefined {
  return request.headers.get(headerName) ?? request.query.get(queryName) ?? undefined;
}

function pdfResponse(pdf: Buffer, fileName: string): HttpResponseInit {
  return {
    status: 200,
    body: pdf,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${sanitizeFileName(fileName)}"`,
      'content-length': pdf.length.toString(),
      'cache-control': 'no-store',
    },
  };
}

function sanitizeFileName(value: string): string {
  const sanitized = value.replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  const name = sanitized || 'document.pdf';

  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

function errorResponse(error: unknown, context: InvocationContext): HttpResponseInit {
  if (error instanceof BadRequestError) {
    return {
      status: 400,
      jsonBody: { error: error.message },
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown error';

  context.error('PDF generation failed.', error);

  if (message.startsWith('Unknown XML Version:')) {
    return {
      status: 422,
      jsonBody: { error: message },
    };
  }

  return {
    status: 500,
    jsonBody: { error: 'PDF generation failed.' },
  };
}
