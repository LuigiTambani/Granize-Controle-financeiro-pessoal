/* eslint-disable @next/next/no-img-element */

export default function Brand({ inverse = false, hero = false }: { inverse?: boolean; hero?: boolean }) {
  return (
    <div className={`brand ${inverse ? "brand-inverse" : ""} ${hero ? "brand-hero" : ""}`}>
      <img src={inverse ? "/granize-lockup-inverse.png" : "/granize-lockup.png"} alt="Granize" draggable={false} />
    </div>
  );
}
