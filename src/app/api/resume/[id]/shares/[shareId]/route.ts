import { NextResponse } from 'next/server';

export async function PATCH() {
  return NextResponse.json(
    { error: 'Online sharing is unavailable in desktop mode' },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Online sharing is unavailable in desktop mode' },
    { status: 410 }
  );
}
