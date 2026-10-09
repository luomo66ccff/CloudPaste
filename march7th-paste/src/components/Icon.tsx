const paths = {
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  archive: "M3 3h18v5H3zM5 8v13h14V8M10 12h4",
  pin: "m8 3 8 0-1 7 4 4H5l4-4-1-7M12 14v8",
  share: "M12 16V3m-5 5 5-5 5 5M4 13v8h16v-8",
  qr: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6v-6M21 12h-3m-6 0v6M3 12h6",
  keyboard:
    "M2 5h20v14H2zM6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  undo: "M3 10h11a7 7 0 0 1 0 14M3 10l6-6M3 10l6 6",
  redo: "M21 10H10a7 7 0 0 0 0 14M21 10l-6-6M21 10l-6 6",
  chevron: "m8 4 8 8-8 8",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  external:
    "M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16",
  text: "M4 5h16M4 12h16M4 19h10",
  markdown: "M3 5h18v14H3zM6 15V9l3 3 3-3v6m3-3 2 2 2-2m-2-3v5",
  clock: "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  lock: "M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18",
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20.9 13a9 9 0 1 1-9.9-9.9A7 7 0 0 0 20.9 13",
  copy: "M9 9h12v12H9zM5 15H3V3h12v2",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  split: "M3 4h18v16H3zM12 4v16",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  close: "m6 6 12 12M6 18 18 6",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  star: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9L12 3",
  file: "M14 2H4v20h16V8l-6-6v6h6M8 13h8m-8 4h6",
  shield: "m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4m-4 10 3 3 5-6",
  link: "m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  flame:
    "M12 3c1 5 7 6 7 12a7 7 0 0 1-14 0c0-3 2-5 3-7 0 3 2 4 3 5 2-3 2-6 1-10",
  terminal: "m4 6 5 6-5 6m8 0h8",
  sparkle:
    "M12 3c.8 4.7 3.3 7.2 8 8-4.7.8-7.2 3.3-8 8-.8-4.7-3.3-7.2-8-8 4.7-.8 7.2-3.3 8-8ZM19 2.5v3m-1.5-1.5h3",
  ticket:
    "M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v2a2.5 2.5 0 0 0 0 5v2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-2a2.5 2.5 0 0 0 0-5v-2ZM15 5v2.5m0 3v3m0 3V19",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="12" fill="url(#m7-brand-gradient) #c8336f" />
      <path
        d="M6.5 28.5C12 19.5 22 13 33.5 12.5"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17.5 8.5Q19.2 18.8 29 20.5 19.2 22.2 17.5 32.5 15.8 22.2 6 20.5 15.8 18.8 17.5 8.5Z"
        fill="white"
      />
      <path
        d="M30.5 5.5Q31 9.5 34.5 10 31 10.5 30.5 14.5 30 10.5 26.5 10 30 9.5 30.5 5.5Z"
        fill="white"
        fillOpacity="0.92"
      />
    </svg>
  );
}
