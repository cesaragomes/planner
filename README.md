Prumo

O Prumo é uma aplicação web pessoal que criei para concentrar a organização da casa e da rotina diária em um único lugar. A ideia nasceu da necessidade de ter algo direto ao ponto, que funcionasse bem tanto no computador (Windows/Linux) quanto instalado como aplicativo no Android, sem precisar dividir informações entre vários apps e planilhas soltas.

O que tem no app

O sistema é dividido numa tela inicial com o resumo do que está programado para o dia e seis módulos que conversam entre si:

Planos para o Dia e Hábitos: agenda dividida por turnos (Manhã, Tarde e Noite), botão para adiar pendências para o dia seguinte e controle de hábitos. Dá para separar hábitos que são feitos todos os dias daqueles com dias certos na semana (ou meta semanal livre), sem quebrar a sequência nos dias de descanso.

Lista de Compras de Rotina: lista de mercado, feira e farmácia separada por setores, com um modo simplificado para usar no celular enquanto faz compras. Ao finalizar o carrinho, o valor total já vai para a planilha de gastos e o preço pago em cada item fica salvo no histórico para acompanhar se o produto subiu ou caiu com o tempo.

Tarefas da Casa: controle das tarefas domésticas pontuais e da limpeza recorrente por cômodo (com escolha dos dias da semana em que cada tarefa acontece).

Planilha de Gastos e Contas Fixas: registro de entradas e saídas do mês, controle dos boletos fixos e definição de tetos de gasto por categoria.

Aquisições e Manutenção da Casa: lista de compras planejadas para a casa (móveis, eletrodomésticos, ferramentas) com link da loja, preço-alvo e histórico de cotações. Quando um item é marcado como comprado, ele passa para a aba de garantias e o valor entra nas despesas do mês. Também tem um controle de revisões e manutenções periódicas.

Despensa e Cardápio Semanal: controle do que tem no armário e na geladeira com aviso de estoque mínimo e validade, livro de receitas e planejamento das refeições da semana (café da manhã, almoço, lanche e jantar). Os itens que estão acabando ou que faltam para as receitas da semana podem ser enviados direto para a lista de compras.

Como funciona na prática

Toda a aplicação roda no navegador a partir de arquivos estáticos, sem depender de build pesado:

Sincronização: o login é feito com a conta Google via Firebase Authentication, e os dados ficam sincronizados em tempo real no Cloud Firestore, além de ficarem salvos localmente no navegador (localStorage).

Backup manual: pelo botão de backup no topo, é possível exportar todos os dados em um arquivo .json ou restaurar um arquivo salvo anteriormente.

Instalação no celular (PWA): acompanhado do manifest.json e do sw.js, o projeto pode ser instalado no Android pelo navegador como um aplicativo de tela cheia.

Estrutura do repositório

index.html — código completo da aplicação (interface, lógica dos módulos e integração com o Firebase).

manifest.json — configuração de instalação do Web App (PWA).

sw.js — Service Worker para suporte à instalação no Android e cache básico.

favicon.ico — ícone do projeto com o monograma PR.

politica-de-privacidade.html e termos-de-servico.html — páginas estáticas de documentação para o consentimento OAuth.
