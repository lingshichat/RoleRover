import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Online sharing is unavailable in desktop mode' },
    { status: 410 }
  );
}
