-- Complete Post article seed with embedded HTTPS images.
--
-- Prerequisites:
--   1. Apply all Prisma migrations, including
--      20260728040000_post_description_html_content.
--   2. Seed the required users and Places with prisma/seed-all.sql.
--
-- Run from the repository root with a libpq-compatible URL (without Prisma's
-- ?schema=public query parameter):
--
--   PowerShell:
--     $psqlUrl = $env:DATABASE_URL -replace '\?schema=public$', ''
--     psql $psqlUrl -v ON_ERROR_STOP=1 -f prisma/seed-post-articles.sql
--
--   Bash:
--     psql "${DATABASE_URL%%\?schema=public}" -v ON_ERROR_STOP=1 \
--       -f prisma/seed-post-articles.sql

BEGIN;

DO $prerequisites$
DECLARE
    missing_authors TEXT;
    missing_places TEXT;
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Required table public.users does not exist';
    END IF;

    IF to_regclass('public.places') IS NULL THEN
        RAISE EXCEPTION 'Required table public.places does not exist';
    END IF;

    IF to_regclass('public.posts') IS NULL THEN
        RAISE EXCEPTION 'Required table public.posts does not exist';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'posts'
          AND column_name = 'description'
    ) THEN
        RAISE EXCEPTION
            'Required column public.posts.description does not exist; apply migration 20260728040000_post_description_html_content first';
    END IF;

    SELECT string_agg(required_author.email, ', ' ORDER BY required_author.email)
    INTO missing_authors
    FROM (
        VALUES
            ('admin@example.com'),
            ('editor@example.com'),
            ('foodie@example.com'),
            ('traveler@example.com')
    ) AS required_author(email)
    LEFT JOIN "users" AS app_user
        ON app_user."email" = required_author.email
    WHERE app_user."id" IS NULL;

    IF missing_authors IS NOT NULL THEN
        RAISE EXCEPTION
            'Required Post authors are missing: %. Run prisma/seed-all.sql first.',
            missing_authors;
    END IF;

    SELECT string_agg(required_place.slug, ', ' ORDER BY required_place.slug)
    INTO missing_places
    FROM (
        VALUES
            ('da-lat'),
            ('dai-noi-hue'),
            ('phong-nha-ke-bang'),
            ('pho-co-hoi-an'),
            ('phu-quoc'),
            ('vinh-ha-long')
    ) AS required_place(slug)
    LEFT JOIN "places" AS place
        ON place."slug" = required_place.slug
    WHERE place."id" IS NULL;

    IF missing_places IS NOT NULL THEN
        RAISE EXCEPTION
            'Required Places are missing: %. Run prisma/seed-all.sql first.',
            missing_places;
    END IF;
END
$prerequisites$;

WITH article_fixtures (
    "id",
    "authorEmail",
    "placeSlug",
    "title",
    "description",
    "content",
    "source",
    "createdAt"
) AS (
    VALUES
        (
            '40000000-0000-4000-8000-000000000001',
            'admin@example.com',
            'vinh-ha-long',
            'Cẩm nang khám phá Vịnh Hạ Long',
            'Lịch trình hai ngày với những trải nghiệm đáng nhớ nhất trên Vịnh Hạ Long.',
            '<figure><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Ha_Long_Bay_in_2019.jpg/1920px-Ha_Long_Bay_in_2019.jpg" alt="Các đảo đá vôi trên Vịnh Hạ Long" loading="lazy"><figcaption>Vịnh Hạ Long. Nguồn: <a href="https://commons.wikimedia.org/wiki/File%3AHa_Long_Bay_in_2019.jpg">Wikimedia Commons</a>.</figcaption></figure><p>Vịnh Hạ Long đẹp nhất khi bạn dành đủ thời gian để đi sâu vào vùng lõi di sản, thay vì chỉ ghé qua trong vài giờ.</p><h2>Ngày đầu trên vịnh</h2><p>Khởi hành từ Tuần Châu, nhận phòng trên tàu và ngắm các đảo đá vôi từ boong tàu. Buổi chiều là thời điểm phù hợp để chèo kayak tại khu vực được hướng dẫn.</p><h2>Ngày thứ hai</h2><p>Dậy sớm ngắm bình minh, dùng bữa sáng rồi tham quan một hang động trước khi tàu trở về bến.</p><h2>Trải nghiệm nên thử</h2><ul><li>Chèo kayak trong vùng nước lặng.</li><li>Ngắm hoàng hôn trên boong tàu.</li><li>Tham quan hang động vào buổi sáng.</li></ul><blockquote>Hãy mang theo kem chống nắng, giày chống trượt và một áo khoác mỏng cho buổi tối.</blockquote>',
            'SYSTEM',
            CURRENT_TIMESTAMP - INTERVAL '20 days'
        ),
        (
            '40000000-0000-4000-8000-000000000002',
            'editor@example.com',
            'pho-co-hoi-an',
            'Một ngày đi bộ trong phố cổ Hội An',
            'Gợi ý lịch trình đi bộ từ chợ Hội An đến phố đèn lồng bên sông Hoài.',
            '<figure><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/H%E1%BB%99i_An%2C_Ancient_Town%2C_2020-01_CN-06.jpg/1920px-H%E1%BB%99i_An%2C_Ancient_Town%2C_2020-01_CN-06.jpg" alt="Phố cổ Hội An với những ngôi nhà màu vàng" loading="lazy"><figcaption>Phố cổ Hội An. Nguồn: <a href="https://commons.wikimedia.org/wiki/File%3AH%E1%BB%99i_An%2C_Ancient_Town%2C_2020-01_CN-06.jpg">Wikimedia Commons</a>.</figcaption></figure><p>Phố cổ Hội An phù hợp để khám phá chậm rãi bằng cách đi bộ trong một ngày. Các điểm chính nằm gần nhau, nhưng bạn vẫn nên dành thời gian nghỉ giữa hành trình.</p><h2>Buổi sáng ở khu chợ</h2><p>Ghé chợ Hội An, thưởng thức một bữa sáng địa phương rồi đi dọc các tuyến phố cổ khi thời tiết còn dịu.</p><h2>Buổi chiều</h2><p>Tham quan Chùa Cầu và các hội quán, sau đó nghỉ chân tại một quán cà phê trong nhà cổ.</p><h2>Khi phố lên đèn</h2><p>Đi bộ về phía sông Hoài trước hoàng hôn để ngắm đèn lồng và không khí buổi tối.</p><p><strong>Lưu ý:</strong> nên mua vé tham quan khu phố cổ tại quầy chính thức và giữ vé trong suốt hành trình.</p>',
            'SYSTEM',
            CURRENT_TIMESTAMP - INTERVAL '16 days'
        ),
        (
            '40000000-0000-4000-8000-000000000003',
            'traveler@example.com',
            'phong-nha-ke-bang',
            'Lần đầu khám phá Phong Nha',
            'Những chuẩn bị cần thiết cho chuyến khám phá hang động đầu tiên tại Phong Nha.',
            '<figure><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Phongnhakebang6.jpg/1920px-Phongnhakebang6.jpg" alt="Cảnh quan núi đá vôi tại Phong Nha - Kẻ Bàng" loading="lazy"><figcaption>Phong Nha - Kẻ Bàng. Nguồn: <a href="https://commons.wikimedia.org/wiki/File%3APhongnhakebang6.jpg">Wikimedia Commons</a>.</figcaption></figure><p>Phong Nha mang đến một hành trình hang động ấn tượng nhưng đòi hỏi sự chuẩn bị phù hợp. Người mới nên chọn tuyến có hướng dẫn viên và thời lượng vừa phải.</p><h2>Đồ dùng cần mang</h2><ul><li>Giày có độ bám tốt.</li><li>Túi chống nước cho điện thoại.</li><li>Quần áo nhẹ và nhanh khô.</li><li>Nước uống theo hướng dẫn của đơn vị tổ chức.</li></ul><h2>An toàn trong hành trình</h2><p>Luôn đi cùng hướng dẫn viên, không tách đoàn và tuân thủ giới hạn của từng tuyến tham quan.</p><h2>Thời điểm phù hợp</h2><p>Kiểm tra dự báo thời tiết trước chuyến đi vì mưa lớn có thể ảnh hưởng đến điều kiện trong hang và lịch khai thác tuyến.</p>',
            'USER',
            CURRENT_TIMESTAMP - INTERVAL '12 days'
        ),
        (
            '40000000-0000-4000-8000-000000000004',
            'foodie@example.com',
            'da-lat',
            'Ăn gì trong một cuối tuần ở Đà Lạt',
            'Thực đơn cuối tuần từ bánh căn buổi sáng đến sữa đậu nành nóng buổi tối.',
            '<figure><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Xuan_Huong_Lake_11.jpg/1920px-Xuan_Huong_Lake_11.jpg" alt="Hồ Xuân Hương tại Đà Lạt" loading="lazy"><figcaption>Không gian trung tâm Đà Lạt. Nguồn: <a href="https://commons.wikimedia.org/wiki/File%3AXuan_Huong_Lake_11.jpg">Wikimedia Commons</a>.</figcaption></figure><p>Một cuối tuần ở Đà Lạt sẽ trọn vẹn hơn khi mỗi buổi trong ngày gắn với một món ăn đặc trưng và một khu phố để khám phá.</p><h2>Bữa sáng</h2><p>Bắt đầu bằng bánh căn nóng, dùng cùng nước chấm và xíu mại. Nên đi sớm để tránh phải chờ lâu.</p><h2>Bữa trưa</h2><p>Ưu tiên các món có rau củ địa phương hoặc một bữa cơm gia đình để cân bằng lịch trình.</p><h2>Buổi tối se lạnh</h2><p>Dạo quanh khu trung tâm, thử món nóng và kết thúc ngày bằng một ly sữa đậu nành.</p><blockquote>Chọn quán đông khách địa phương, xem thực đơn và hỏi giá trước khi gọi món.</blockquote>',
            'USER',
            CURRENT_TIMESTAMP - INTERVAL '8 days'
        ),
        (
            '40000000-0000-4000-8000-000000000005',
            'traveler@example.com',
            'phu-quoc',
            'Lịch trình ba ngày ở Phú Quốc',
            'Lịch trình cân bằng giữa phía bắc đảo, bãi biển và làng chài Phú Quốc.',
            '<figure><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Bai-sao-phu-quoc-tuonglamphotos.jpg/1920px-Bai-sao-phu-quoc-tuonglamphotos.jpg" alt="Bãi Sao với cát trắng và nước biển xanh tại Phú Quốc" loading="lazy"><figcaption>Bãi Sao, Phú Quốc. Nguồn: <a href="https://commons.wikimedia.org/wiki/File%3ABai-sao-phu-quoc-tuonglamphotos.jpg">Wikimedia Commons</a>.</figcaption></figure><p>Ba ngày là khoảng thời gian vừa đủ để kết hợp thiên nhiên, biển và đời sống địa phương ở Phú Quốc mà không phải di chuyển quá gấp.</p><h2>Ngày 1: phía bắc đảo</h2><p>Khám phá rừng và các điểm tham quan ở phía bắc. Sắp xếp các điểm gần nhau để giảm thời gian di chuyển.</p><h2>Ngày 2: dành cho biển</h2><p>Chọn một bãi biển, lặn ngắm san hô cùng đơn vị uy tín hoặc đơn giản là nghỉ ngơi bên bờ biển.</p><h2>Ngày 3: làng chài</h2><p>Ghé làng chài vào buổi sáng, tìm hiểu nhịp sống địa phương và thưởng thức hải sản trước khi trở về.</p><p><strong>Mẹo nhỏ:</strong> luôn kiểm tra thời tiết và tình trạng biển trước các hoạt động ngoài khơi.</p>',
            'USER',
            CURRENT_TIMESTAMP - INTERVAL '4 days'
        ),
        (
            '40000000-0000-4000-8000-000000000006',
            'editor@example.com',
            'dai-noi-hue',
            'Những lưu ý khi tham quan Đại Nội Huế',
            'Cách chọn thời gian, trang phục và lộ trình phù hợp khi tham quan Đại Nội Huế.',
            '<figure><img src="https://upload.wikimedia.org/wikipedia/commons/b/b9/%C4%90%E1%BA%A1i_n%E1%BB%99i.jpg" alt="Công trình kiến trúc bên trong Đại Nội Huế" loading="lazy"><figcaption>Đại Nội Huế. Nguồn: <a href="https://commons.wikimedia.org/wiki/File%3A%C4%90%E1%BA%A1i_n%E1%BB%99i.jpg">Wikimedia Commons</a>.</figcaption></figure><p>Đại Nội Huế có khuôn viên rộng, vì vậy một kế hoạch đơn giản sẽ giúp chuyến tham quan thoải mái và có đủ thời gian tìm hiểu từng khu vực.</p><h2>Thời gian phù hợp</h2><p>Nên bắt đầu vào buổi sáng để tránh nắng khi đi qua các sân và khu điện. Kiểm tra giờ mở cửa trước ngày tham quan.</p><h2>Trang phục và vật dụng</h2><ul><li>Mặc trang phục lịch sự.</li><li>Mang theo nước uống.</li><li>Chuẩn bị mũ hoặc ô nhỏ.</li><li>Đi giày phù hợp với quãng đường dài.</li></ul><h2>Lộ trình tham khảo</h2><p>Bắt đầu từ Ngọ Môn, đi lần lượt qua các trục chính rồi dành thời gian cho những khu trưng bày đang mở cửa.</p><p>Luôn tuân thủ biển hướng dẫn và không đi vào các khu vực đang được bảo tồn.</p>',
            'SYSTEM',
            CURRENT_TIMESTAMP - INTERVAL '2 days'
        )
),
resolved_articles AS (
    SELECT
        article."id",
        app_user."id" AS "authorId",
        place."id" AS "placeId",
        article."title",
        article."description",
        article."content",
        article."source",
        article."createdAt"
    FROM article_fixtures AS article
    JOIN "users" AS app_user
        ON app_user."email" = article."authorEmail"
    JOIN "places" AS place
        ON place."slug" = article."placeSlug"
)
INSERT INTO "posts" (
    "id",
    "authorId",
    "placeId",
    "title",
    "description",
    "content",
    "source",
    "status",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    article."id",
    article."authorId",
    article."placeId",
    article."title",
    article."description",
    article."content",
    article."source"::"PostSource",
    'PUBLISHED'::"ContentStatus",
    NULL,
    article."createdAt",
    article."createdAt"
FROM resolved_articles AS article
ON CONFLICT ("id") DO UPDATE
SET
    "authorId" = EXCLUDED."authorId",
    "placeId" = EXCLUDED."placeId",
    "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "content" = EXCLUDED."content",
    "source" = EXCLUDED."source",
    "status" = EXCLUDED."status",
    "deletedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;

SELECT
    post."id",
    post."title",
    place."slug" AS "placeSlug",
    app_user."email" AS "authorEmail",
    post."source",
    post."status",
    post."content" LIKE '%<img src="https://%' AS "hasHttpsImage",
    char_length(post."description") AS "descriptionLength",
    char_length(post."content") AS "contentLength",
    post."updatedAt"
FROM "posts" AS post
JOIN "users" AS app_user
    ON app_user."id" = post."authorId"
LEFT JOIN "places" AS place
    ON place."id" = post."placeId"
WHERE post."id" IN (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000005',
    '40000000-0000-4000-8000-000000000006'
)
ORDER BY post."createdAt", post."id";
