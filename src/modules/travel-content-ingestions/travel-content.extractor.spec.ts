import {
  extractArticle,
  extractDestinations,
} from './travel-content.extractor';

describe('travel content extractor', () => {
  it('should create bounded attributed article content from useful markdown', () => {
    const markdown = `# Hạ Long\n\n${'Hạ Long là điểm đến du lịch nổi tiếng với cảnh quan thiên nhiên và nhiều trải nghiệm dành cho du khách. '.repeat(
      4,
    )}`;

    const article = extractArticle(
      markdown,
      'Kinh nghiệm du lịch Hạ Long',
      'Example Travel',
      'https://example.com/ha-long',
    );

    expect(article).toMatchObject({
      description: 'Kinh nghiệm du lịch Hạ Long',
    });
    expect(article?.content).toContain('Xem nội dung gốc');
    expect(article?.visibleText.length).toBeGreaterThan(240);
    expect(article?.visibleText.length).toBeLessThanOrEqual(6000);
  });

  it('should reject short pages and extract qualified destination sections', () => {
    expect(
      extractArticle('Short page', 'Short', 'Example', 'https://example.com'),
    ).toBeNull();

    const destinations = extractDestinations(
      `## 1. Bà Nà Hills\n\n${'Bà Nà Hills là khu du lịch vui chơi nổi bật tại Đà Nẵng với nhiều hoạt động giải trí và cảnh quan trên núi. '.repeat(
        3,
      )} Địa chỉ: Hòa Vang, Đà Nẵng. Tọa độ: 15.995, 107.996\n\n## Kinh nghiệm du lịch\n\n${'Thông tin chung dành cho hành trình. '.repeat(
        8,
      )}`,
      'Đà Nẵng',
      'Example Travel',
      'https://example.com/ba-na',
    );

    expect(destinations).toHaveLength(1);
    expect(destinations[0]).toMatchObject({
      name: 'Bà Nà Hills',
      address: 'Hòa Vang, Đà Nẵng',
      latitude: 15.995,
      longitude: 107.996,
    });
  });
});
