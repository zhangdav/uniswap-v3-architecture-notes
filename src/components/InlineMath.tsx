import React from 'react';
import katex from 'katex';

type InlineMathProps = {
  tex: string;
};

export default function InlineMath({tex}: InlineMathProps): React.ReactElement {
  return (
    <span
      className="math-inline"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(tex, {
          displayMode: false,
          throwOnError: false,
        }),
      }}
    />
  );
}
