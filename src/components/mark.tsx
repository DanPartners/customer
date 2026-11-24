/**
 * 單, drawn from flat strokes, with the last stroke falling as a torn receipt.
 * One path on a 250 by 304 grid; each stroke is 20 units.
 *
 * The same geometry is in src/app/icon.svg, public/icon.svg and the icon
 * masters in the wiki (Attachments/). Change them together.
 */
export const GLYPH_WIDTH = 250;
export const GLYPH_HEIGHT = 304;
export const GLYPH_PATH =
  "M35 0h80v60H35zM55 20v20h40V20zM135 0h80v60h-80zM155 20v20h40V20z" +
  "M35 78h180v110h-80v18h115v20h-95v63l-10 15-10-15-10 15-10-15-10 15-10-15v-63H0v-20h115v-18H35z" +
  "M55 98v25h60V98zM135 98v25h60V98zM55 143v25h60v-25zM135 143v25h60v-25z" +
  "M106 244v7h38v-7zM106 263v7h25v-7z";

type MarkProps = {
  title?: string;
  className?: string;
};

/** The character alone, in the current text colour. For use on a colour field. */
export function DanGlyph({ height = 32, title, className }: MarkProps & { height?: number }) {
  return (
    <svg
      width={(height * GLYPH_WIDTH) / GLYPH_HEIGHT}
      height={height}
      viewBox={`0 0 ${GLYPH_WIDTH} ${GLYPH_HEIGHT}`}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path fill="currentColor" fillRule="evenodd" d={GLYPH_PATH} />
    </svg>
  );
}

/**
 * The seal: a vermilion rounded square with the white character. This is the
 * brand mark, so it keeps its colours in every theme.
 */
export function DanMark({ size = 48, title, className }: MarkProps & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 420 420"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="420" height="420" rx="92" fill="#B83A2E" />
      <path fill="#FFFFFF" fillRule="evenodd" transform="translate(85 58)" d={GLYPH_PATH} />
    </svg>
  );
}
