"use client";

type Props = {
  height?: number;
  className?: string;
  priority?: boolean;
};

function NeutralLogo({ height = 40, className = "" }: Props) {
  const box = Math.max(28, Math.round(height * 0.8));
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#4F8EF7] font-black text-white"
        style={{ width: box, height: box, fontSize: Math.max(11, Math.round(box * 0.34)) }}
      >
        TI
      </span>
      <span className="leading-none">
        <span className="block text-sm font-bold text-current">Techserve ICT Solutions</span>
        <span className="block text-[12px] font-medium text-current opacity-55">Service Desk</span>
      </span>
    </span>
  );
}

export function AppLogo(props: Props) {
  return <NeutralLogo {...props} />;
}

export function AppLogoDark(props: Props) {
  return <NeutralLogo {...props} />;
}
