import React from 'react';

// Keep the assignment's responsive-image contract in both gallery and detail views.
export default function PhotoImage({ story, expanded = false }) {
  const variants = story.variants;
  const fallback = variants?.[0];
  const dimensions = variants?.at(-1);
  return <img
    src={fallback?.url || story.image}
    srcSet={variants?.map(variant => `${variant.url} ${variant.width}w`).join(', ')}
    sizes={variants ? (expanded ? '(max-width: 900px) calc(100vw - 40px), 380px' : '(max-width: 768px) 220px, 250px') : undefined}
    width={dimensions?.width}
    height={dimensions?.height}
    loading={expanded ? 'eager' : 'lazy'}
    decoding="async"
    alt={story.alt}
    className={expanded ? 'expanded-blend-img' : 'story-img'}
  />;
}
