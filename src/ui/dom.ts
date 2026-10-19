/** Small helper so rendering code reads top-to-bottom like the layout. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string } = {},
  ...children: (Node | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text) node.textContent = props.text;
  for (const child of children) if (child) node.append(child);
  return node;
}

export function button(label: string, onClick: () => void, variant: 'primary' | 'secondary' = 'primary') {
  const b = el('button', { className: `btn btn-${variant}`, text: label });
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
