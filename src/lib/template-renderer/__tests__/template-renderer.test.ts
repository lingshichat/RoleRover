import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Resume } from '@/types/resume';
import { getUnifiedTemplate, toCanonicalResume } from '@/lib/template-renderer';

function createSampleResume(template: string): Resume {
  const now = new Date('2026-03-31T00:00:00.000Z');

  return {
    id: 'resume-1',
    userId: 'user-1',
    title: 'Senior Frontend Engineer',
    template,
    themeConfig: {
      primaryColor: '#111827',
      accentColor: '#e94560',
      fontFamily: 'Inter',
      fontSize: 'medium',
      lineSpacing: 1.5,
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      sectionSpacing: 16,
      avatarStyle: 'circle',
    },
    isDefault: false,
    language: 'en',
    targetJobTitle: null,
    targetCompany: null,
    createdAt: now,
    updatedAt: now,
    sections: [
      {
        id: 'summary',
        resumeId: 'resume-1',
        type: 'summary',
        title: 'Summary',
        sortOrder: 2,
        visible: true,
        content: {
          text: 'Built **shipping** systems for global teams.',
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'work',
        resumeId: 'resume-1',
        type: 'work_experience',
        title: 'Experience',
        sortOrder: 3,
        visible: true,
        content: {
          items: [
            {
              id: 'work-1',
              company: 'RoleRover',
              position: 'Frontend Engineer',
              startDate: '2023-01',
              endDate: null,
              current: true,
              description: 'Delivered cross-platform resume rendering.',
              technologies: ['React', 'TypeScript'],
              highlights: ['Cut export regressions by 80%'],
            },
          ],
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'skills',
        resumeId: 'resume-1',
        type: 'skills',
        title: 'Skills',
        sortOrder: 4,
        visible: true,
        content: {
          categories: [
            {
              id: 'skills-1',
              name: 'Core',
              skills: ['React', 'TypeScript', 'Tauri'],
            },
          ],
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'personal',
        resumeId: 'resume-1',
        type: 'personal_info',
        title: 'Personal Info',
        sortOrder: 1,
        visible: true,
        content: {
          fullName: 'Alex Template',
          jobTitle: 'Senior Frontend Engineer',
          email: 'alex@example.com',
          phone: '123-456-7890',
          location: 'Hong Kong',
          website: 'https://example.com',
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function countSections(markup: string): number {
  return (markup.match(/data-section/g) || []).length;
}

function assertAppearsInOrder(markup: string, values: string[]): void {
  let cursor = 0;

  for (const value of values) {
    const index = markup.indexOf(value, cursor);
    assert.notEqual(index, -1, `"${value}" should appear in markup`);
    cursor = index + value.length;
  }
}

function testCanonicalResumeMetadata(): void {
  const canonical = toCanonicalResume(createSampleResume('classic'));

  assert.equal(canonical.personalInfo.fullName, 'Alex Template');
  assert.deepEqual(
    canonical.sections.map((section) => ({
      id: section.id,
      visible: section.visible,
      sortOrder: section.sortOrder,
    })),
    [
      { id: 'personal', visible: true, sortOrder: 1 },
      { id: 'summary', visible: true, sortOrder: 2 },
      { id: 'work', visible: true, sortOrder: 3 },
      { id: 'skills', visible: true, sortOrder: 4 },
    ],
  );
}

function testTemplateParity(templateId: string): void {
  const unifiedTemplate = getUnifiedTemplate(templateId);
  assert.ok(unifiedTemplate, `Expected "${templateId}" to be registered`);

  const canonical = toCanonicalResume(createSampleResume(templateId));
  const previewMarkup = renderToStaticMarkup(
    React.createElement(unifiedTemplate.PreviewComponent, { resume: canonical }),
  );
  const exportMarkup = unifiedTemplate.buildHtml(canonical);

  assert.equal(countSections(previewMarkup), countSections(exportMarkup));
  assertAppearsInOrder(previewMarkup, ['Summary', 'Experience', 'Skills']);
  assertAppearsInOrder(exportMarkup, ['Summary', 'Experience', 'Skills']);
  assert.match(previewMarkup, /Alex Template/);
  assert.match(exportMarkup, /Alex Template/);
  assert.match(previewMarkup, /<strong>shipping<\/strong>/);
  assert.match(exportMarkup, /<strong>shipping<\/strong>/);
}

testCanonicalResumeMetadata();
testTemplateParity('classic');
testTemplateParity('modern');
