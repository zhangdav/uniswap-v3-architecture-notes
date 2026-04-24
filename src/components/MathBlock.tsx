import React from 'react';
import katex from 'katex';

type MathBlockProps = {
  tex: string;
};

export default function MathBlock({tex}: MathBlockProps): React.ReactElement {
  return (
    <div
      className="math-block"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(tex, {
          displayMode: true,
          throwOnError: false,
        }),
      }}
    />
  );
}
