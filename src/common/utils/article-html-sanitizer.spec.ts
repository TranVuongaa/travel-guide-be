import { BadRequestException } from '@nestjs/common';

import { sanitizeArticleHtml } from './article-html-sanitizer';

describe('sanitizeArticleHtml', () => {
  it('should preserve article markup and remove executable HTML', () => {
    const result = sanitizeArticleHtml(`
      <h2 onclick="alert('xss')">Plan</h2>
      <p style="color:red">Visit <strong>Ha Long Bay</strong>.</p>
      <script>alert('xss')</script>
      <iframe src="https://example.com"></iframe>
    `);

    expect(result).toContain('<h2>Plan</h2>');
    expect(result).toContain('<p>Visit <strong>Ha Long Bay</strong>.</p>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('style');
    expect(result).not.toContain('script');
    expect(result).not.toContain('iframe');
    expect(result).not.toContain("alert('xss')");
  });

  it('should keep safe links and images while removing unsafe URLs', () => {
    const result = sanitizeArticleHtml(`
      <p>
        Read the
        <a href="https://example.com" target="_blank">guide</a>.
      </p>
      <img src="https://images.example.com/guide.jpg" alt="Guide">
      <img src="http://images.example.com/unsafe.jpg" alt="Unsafe">
      <a href="javascript:alert('xss')">unsafe link</a>
    `);

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain(
      '<img src="https://images.example.com/guide.jpg" alt="Guide" loading="lazy" />',
    );
    expect(result).not.toContain('http://images.example.com/unsafe.jpg');
    expect(result).not.toContain('javascript:');
  });

  it('should reject content without meaningful visible text', () => {
    expect(() =>
      sanitizeArticleHtml(
        '<script>alert("xss")</script><img src="https://example.com/a.jpg">',
        'Destination content',
      ),
    ).toThrow(BadRequestException);
  });
});
