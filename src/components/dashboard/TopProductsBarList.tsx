export function TopProductsBarList({ data }: { data: { product: { nome: string }; venduto: number }[] }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.venduto))

  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.product.nome} className="flex items-center gap-3">
          <span className="font-display w-28 shrink-0 truncate text-sm italic text-heemia-black">{d.product.nome}</span>
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-heemia-cream-dark">
            <div
              className="h-[3px] rounded-full bg-heemia-black transition-all duration-500 ease-heemia"
              style={{ width: `${Math.max((d.venduto / max) * 100, 4)}%` }}
            />
          </div>
          <span className="font-mono-heemia w-8 shrink-0 text-right text-xs text-heemia-grey">{d.venduto}</span>
        </li>
      ))}
    </ul>
  )
}
