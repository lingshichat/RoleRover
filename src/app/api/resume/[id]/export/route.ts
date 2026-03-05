import { NextRequest, NextResponse } from 'next/server';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { generatePdf } from '@/lib/pdf/generate-pdf';
import { generateHtml } from './builders';
import { generatePlainText } from './plain-text';
import { generateDocxBuffer } from './docx';

// Chromium download + PDF render needs more time on Vercel serverless
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resume = await resumeRepository.findById(id);
    if (!resume) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (resume.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const format = request.nextUrl.searchParams.get('format') || 'json';
    const title = resume.title || 'resume';
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `${title}-${ts}`;

    switch (format) {
      case 'json': {
        return NextResponse.json(resume);
      }
      case 'html': {
        const html = await generateHtml(resume);
        return new NextResponse(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.html"`,
          },
        });
      }
      case 'txt': {
        const text = generatePlainText(resume);
        return new NextResponse(text, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.txt"`,
          },
        });
      }
      case 'docx': {
        const docxBuffer = await generateDocxBuffer(resume);
        return new NextResponse(new Uint8Array(docxBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.docx"`,
          },
        });
      }
      case 'pdf': {
        const fitOnePage = request.nextUrl.searchParams.get('fitOnePage') === 'true';
        const pdfHtml = await generateHtml(resume, true);
        const pdfBuffer = await generatePdf(pdfHtml, { fitOnePage });
        return new NextResponse(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.pdf"`,
          },
        });
      }
      default: {
        return NextResponse.json(
          { error: `Unsupported format: ${format}. Supported: json, html, txt, docx, pdf` },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    console.error('GET /api/resume/[id]/export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
