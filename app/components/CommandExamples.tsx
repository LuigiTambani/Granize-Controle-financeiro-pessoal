"use client";
export const commandGroups = [
  {
    id: "expenses", title: "Gastos do dia a dia", description: "Conte onde gastou e qual foi o valor.",
    commands: [
      "Gastei 58 no restaurante",
      "Paguei 120 de internet",
      "Comprei 80 no supermercado",
      "Gastei 35 com Uber",
      "Paguei 150 na conta de luz",
      "Gastei 25 na farmácia",
    ],
  },
  {
    id: "income-reports", title: "Ganhos e relatórios", description: "Registre entradas e acompanhe seu dinheiro.",
    commands: [
      "Recebi 2500 de salário",
      "Ganhei 100 de presente",
      "Entrou 300 de freelance",
      "Acabei de ganhar 5 mil reais",
      "Saldo",
      "Resumo",
      "Quanto tenho?",
    ],
  },
  {
    id: "shopping", title: "Sua lista de compras", description: "Lembre do que falta, mesmo fora de casa.",
    commands: [
      "Granize, acabou a pasta de dente",
      "Está faltando café",
      "Preciso comprar papel higiênico",
      "Adicione leite e arroz à lista de compras",
      "Lista de compras",
      "O que preciso comprar?",
      "Marque leite como comprado",
      "Remova arroz da lista",
    ],
  },
];

export const commandRows = Array.from({ length: 3 }, (_, row) => commandGroups.flatMap((group) => group.commands).filter((_, index) => index % 3 === row));

export default function CommandExamples() {
  return <section className="command-examples" aria-labelledby="command-examples-title">
    <header><h2 id="command-examples-title">Você manda uma mensagem.<br />A Granize te ajuda a organizar.</h2><p>Algumas mensagens que você pode enviar pelo WhatsApp. Do seu jeito, por texto ou áudio.</p></header>
    <div className="command-carousel" role="region" aria-label="Exemplos de mensagens no WhatsApp" aria-live="off">
      <div className="command-carousel-rows">{commandRows.map((commands, row) =>
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Allows keyboard scrolling when reduced motion is enabled.
        <div className="command-carousel-row" key={row} tabIndex={0} role="group" aria-label={`Faixa ${row + 1} de exemplos`}>
        <div className="command-carousel-track">{[0, 1].map((copy) => <ul className="command-carousel-copy" key={copy} aria-hidden={copy === 1 ? true : undefined} aria-label={copy === 0 ? `Mensagens da faixa ${row + 1}` : undefined}>{commands.map((command, index) => <li className="command-message" key={command}><span>{command}</span><span className="command-message-receipt" aria-hidden="true"><span>{`${String(9 + row * 2).padStart(2, "0")}:${String(12 + index * 5).padStart(2, "0")}`}</span><svg width="15" height="12" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m1 8 4 4L15 2m-5 9 2 2L23 2" /></svg></span></li>)}</ul>)}</div>
      </div>)}</div>
    </div>
  </section>;
}
