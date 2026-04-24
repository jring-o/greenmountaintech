/**
 * Honeypot field — visually hidden input that bots tend to fill in.
 * Screen readers skip it via aria-hidden, and tabindex=-1 prevents keyboard focus.
 */
export default function Honeypot({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
      <label>
        Do not fill this in
        <input
          type="text"
          name="hp_url"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
