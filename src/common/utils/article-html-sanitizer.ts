import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

const ARTICLE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'blockquote',
    'a',
    'img',
    'figure',
    'figcaption',
    'br',
    'hr',
    'code',
    'pre',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'width', 'height'],
  },
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
    img: ['https'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nestingLimit: 20,
  parseStyleAttributes: false,
  transformTags: {
    a: (tagName, attributes) => ({
      tagName,
      attribs: {
        ...(attributes.href ? { href: attributes.href } : {}),
        ...(attributes.title ? { title: attributes.title } : {}),
        ...(attributes.target === '_blank'
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {}),
      },
    }),
    img: (tagName, attributes) => ({
      tagName,
      attribs: {
        ...(attributes.src ? { src: attributes.src } : {}),
        ...(attributes.alt ? { alt: attributes.alt } : {}),
        ...(attributes.title ? { title: attributes.title } : {}),
        ...(/^\d{1,5}$/u.test(attributes.width ?? '')
          ? { width: attributes.width }
          : {}),
        ...(/^\d{1,5}$/u.test(attributes.height ?? '')
          ? { height: attributes.height }
          : {}),
        loading: 'lazy',
      },
    }),
  },
  exclusiveFilter: (frame) =>
    frame.tag === 'img' && !/^https:\/\//i.test(frame.attribs.src ?? ''),
};

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

export function articleVisibleText(content: string): string {
  return sanitizeHtml(content, PLAIN_TEXT_OPTIONS)
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function sanitizeArticleHtml(
  content: string,
  fieldLabel = 'Content',
): string {
  const sanitizedContent = sanitizeHtml(content, ARTICLE_HTML_OPTIONS).trim();
  const visibleText = articleVisibleText(sanitizedContent).replace(/\s+/gu, '');

  if (!visibleText) {
    throw new BadRequestException(
      `${fieldLabel} must contain meaningful visible text`,
    );
  }

  return sanitizedContent;
}
