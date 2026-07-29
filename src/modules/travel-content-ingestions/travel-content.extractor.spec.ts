import {
  extractArticle,
  extractDestinations,
} from './travel-content.extractor';

describe('travel content extractor', () => {
  it('should preserve long semantic article HTML and normalize safe images', async () => {
    const validator = jest.fn().mockResolvedValue(undefined);
    const paragraph =
      'Hạ Long là điểm đến du lịch nổi tiếng tại Quảng Ninh với cảnh quan thiên nhiên, các tuyến tham quan, văn hóa địa phương và nhiều kinh nghiệm hữu ích cho du khách. ';
    const article = await extractArticle(
      {
        rawHtml: `
          <html>
            <body>
              <header>Site menu</header>
              <main>
                <article itemprop="articleBody" class="source-layout">
                  <h1 style="color:red">Cẩm nang Hạ Long</h1>
                  <p onclick="alert(1)">${paragraph.repeat(3)}</p>
                  <h2>Trải nghiệm nổi bật</h2>
                  <ul><li>Du thuyền trên vịnh</li><li>Khám phá hang động</li></ul>
                  <blockquote>Mang theo đồ chống nắng và nước uống.</blockquote>
                  <figure>
                    <img data-src="/images/ha-long.jpg" alt="Vịnh Hạ Long"
                      width="1200" height="800">
                    <figcaption>Toàn cảnh Vịnh Hạ Long</figcaption>
                  </figure>
                  <script>alert('unsafe')</script>
                </article>
              </main>
              <footer>Copyright</footer>
            </body>
          </html>
        `,
        markdown: '',
        finalUrl: 'https://travel.example.com/guides/ha-long',
      },
      'Kinh nghiệm du lịch Hạ Long',
      'Example Travel',
      'https://travel.example.com/guides/ha-long',
      validator,
    );

    expect(article).toMatchObject({
      description: 'Kinh nghiệm du lịch Hạ Long',
      imageCount: 1,
    });
    expect(article?.visibleText.length).toBeGreaterThan(240);
    expect(article?.content).toContain('<h2>Cẩm nang Hạ Long</h2>');
    expect(article?.content).toContain('<ul>');
    expect(article?.content).toContain('<blockquote>');
    expect(article?.content).toContain('<figure>');
    expect(article?.content).toContain(
      'src="https://travel.example.com/images/ha-long.jpg"',
    );
    expect(article?.content).toContain('width="1200" height="800"');
    expect(article?.content).toContain('loading="lazy"');
    expect(article?.content).toContain('Xem nội dung gốc');
    expect(article?.content).not.toContain('source-layout');
    expect(article?.content).not.toContain('onclick');
    expect(article?.content).not.toContain('<script');
    expect(article?.content).not.toContain('Site menu');
    expect(validator).toHaveBeenCalledWith(
      'https://travel.example.com/images/ha-long.jpg',
    );
  });

  it('should enforce block, text, and image limits without malformed HTML', async () => {
    const blocks = Array.from(
      { length: 50 },
      (_value, index) =>
        `<p>Đoạn ${index} về kinh nghiệm du lịch Việt Nam ${'với thông tin hữu ích '.repeat(
          30,
        )}<img src="https://images.example.com/photo-${index}.jpg" alt="Ảnh ${index}"></p>`,
    ).join('');

    const article = await extractArticle(
      {
        rawHtml: `<article>${blocks}</article>`,
        markdown: '',
        finalUrl: 'https://example.com/article',
      },
      'Cẩm nang du lịch Việt Nam',
      'Example',
      'https://example.com/article',
    );

    expect(article).not.toBeNull();
    expect(article?.visibleText.length).toBeLessThanOrEqual(20000);
    expect(article?.blockCount).toBeLessThanOrEqual(40);
    expect(article?.imageCount).toBe(8);
    expect(article?.content.match(/<img\b/gu)).toHaveLength(8);
    expect(article?.content).not.toMatch(/<p>[^<]*$/u);
  });

  it('should reject unsafe images and use the Markdown fallback', async () => {
    const paragraph =
      'Đà Nẵng là điểm đến du lịch với bãi biển, ẩm thực, địa điểm tham quan và lịch trình đa dạng dành cho du khách. ';
    const article = await extractArticle(
      {
        rawHtml: `<article>
          <p>${paragraph.repeat(3)}</p>
          <img src="http://images.example.com/insecure.jpg">
          <img src="https://localhost/private.jpg">
          <img src="https://images.example.com/vector.svg">
          <img src="https://images.example.com/ad-banner.jpg">
          <img src="https://images.example.com/tiny.jpg" width="10" height="10">
          <img src="https://images.example.com/rejected.jpg">
        </article>`,
        markdown: '',
        finalUrl: 'https://example.com/article',
      },
      'Du lịch Đà Nẵng',
      'Example',
      'https://example.com/article',
      (url) =>
        url.includes('rejected')
          ? Promise.reject(new Error('Private DNS result'))
          : Promise.resolve(),
    );

    expect(article?.imageCount).toBe(0);
    expect(article?.content).not.toContain('<img');

    const fallback = await extractArticle(
      {
        rawHtml: '',
        markdown: `# Hạ Long\n\n${paragraph.repeat(4)}`,
        finalUrl: 'https://example.com/fallback',
      },
      'Kinh nghiệm du lịch Hạ Long',
      'Example Travel',
      'https://example.com/fallback',
    );
    expect(fallback).toMatchObject({
      description: 'Kinh nghiệm du lịch Hạ Long',
      imageCount: 0,
    });
    expect(fallback?.content).toContain('<h2>Tổng quan</h2>');
  });

  it('should extract a bounded rich destination section', async () => {
    const body =
      'Bà Nà Hills là khu du lịch vui chơi nổi bật tại Đà Nẵng với nhiều hoạt động giải trí, cảnh quan trên núi và thông tin hữu ích cho du khách. ';
    const article = await extractArticle(
      {
        rawHtml: `<article>
          <h1>Cẩm nang Đà Nẵng</h1>
          <p>${body.repeat(2)}</p>
          <h2>1. Bà Nà Hills</h2>
          <p>${body.repeat(3)} Địa chỉ: Hòa Vang, Đà Nẵng. Tọa độ: 15.995, 107.996</p>
          <figure><img src="https://images.example.com/ba-na.jpg" alt="Bà Nà Hills"><figcaption>Bà Nà Hills</figcaption></figure>
          <h2>Kinh nghiệm du lịch</h2>
          <p>${'Thông tin chung dành cho hành trình. '.repeat(8)}</p>
        </article>`,
        markdown: '',
        finalUrl: 'https://example.com/ba-na',
      },
      'Kinh nghiệm du lịch Bà Nà Hills',
      'Example Travel',
      'https://example.com/ba-na',
    );

    const destinations = extractDestinations(
      '',
      'Đà Nẵng',
      'Example Travel',
      'https://example.com/ba-na',
      article?.content,
    );

    expect(destinations).toHaveLength(1);
    expect(destinations[0]).toMatchObject({
      name: 'Bà Nà Hills',
      address: 'Hòa Vang, Đà Nẵng',
      latitude: 15.995,
      longitude: 107.996,
      imageCount: 1,
    });
    expect(destinations[0].content).toContain('<figure>');
    expect(destinations[0].content).toContain('Xem nội dung gốc');
  });
});
