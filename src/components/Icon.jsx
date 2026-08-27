/* FUWA POS — iconos de línea (simples, trazo). */

const PATHS = {
  order: "M3 6h18M3 6l1.5 13a2 2 0 0 0 2 1.8h11a2 2 0 0 0 2-1.8L21 6M9 10v6M15 10v6",
  bag: "M6 8h12l-1 12H7L6 8zM9 8a3 3 0 0 1 6 0",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  edit: "M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3zM14 7l3 3",
  chart: "M5 21V11M12 21V5M19 21v-7M3 21h18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  trash: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13",
  cash: "M3 6h18v12H3zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6M6 6v12M18 6v12",
  card: "M3 7h18v10H3zM3 11h18",
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6L6 18",
  back: "M15 6l-6 6 6 6",
  note: "M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2V4z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  print: "M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v6H7v-6z",
  star: "M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.5 6.8 19l1.2-5.6L4 9.6 9.6 9 12 4z",
  logout: "M15 12H4M8 8l-4 4 4 4M14 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20a6 6 0 0 1 12 0M16 11a3 3 0 0 0 0-6M21 20a6 6 0 0 0-5-5.9",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  unlock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 5.8-1",
  tools: "M3 8h18v11H3zM8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18",
  report: "M6 3h9l4 4v14H6V3zM15 3v4h4M9 12h6M9 16h6M9 8h2",
  table: "M3 8h18M5 8l-1.5 11M19 8l1.5 11M12 8v11M8 15h8",
  box: "M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4M20 8l-8 4M12 12v8",
  alert: "M12 9v5M12 17.5v.5M10.3 4.3L2.8 17.6A1.5 1.5 0 0 0 4.1 20h15.8a1.5 1.5 0 0 0 1.3-2.4L13.7 4.3a2 2 0 0 0-3.4 0z",
};

export function Icon({ name, size = 22, stroke = 2, color = "currentColor", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d={PATHS[name] || ""} />
    </svg>
  );
}
