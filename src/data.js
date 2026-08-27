/* Café del Valle POS — datos del menú, categorías, tamaños y modificadores.
   Moneda: Quetzal (Q). Precios ya incluyen impuestos. */

// Tonos de tierra derivados de un tono (hue), para que las categorías nuevas
// que cree el cliente caigan solas en la familia de la marca. La croma es baja
// a propósito: el pastel saturado de antes daba rosas de caramelo que no
// pertenecen a Café del Valle. Con 0.028 cualquier hue sale terroso.
export function catColors(hue) {
  return { tint: `oklch(0.93 0.028 ${hue})`, ink: `oklch(0.42 0.06 ${hue})` };
}

const C = (id, name, icon, hue, station = "barra") => ({ id, name, icon, hue, station, ...catColors(hue) });

/* Categorías por defecto (editables desde el editor de menú).

   `station` decide a dónde va el item al enviar la orden: "barra" aparece en el
   tablero del barista y "cocina" imprime comanda en la impresora de cocina.
   Ver src/lib/stations.js. */
export const CATEGORIES = [
  /* Menú corto de pruebas. Los hue caen en el rango cálido/olivo del logo:
     café (70), panadería (78), postres (45) y comida (120). */
  C("cafe", "Café", "☕", 70, "barra"),
  C("panaderia", "Panadería", "🥐", 78, "cocina"),
  C("postres", "Postres", "🍰", 45, "cocina"),
  C("comida", "Comida", "🥪", 120, "cocina"),
];

// Áreas de mesas por defecto (editables desde la pantalla "Mesas").
// Cada mesa tiene etiqueta y posición x/y en % dentro del mapa del área.
export const AREAS = [
  {
    id: "salon",
    name: "Salón",
    tables: [
      { id: "s1", label: "1", x: 18, y: 25 },
      { id: "s2", label: "2", x: 50, y: 25 },
      { id: "s3", label: "3", x: 82, y: 25 },
      { id: "s4", label: "4", x: 18, y: 70 },
      { id: "s5", label: "5", x: 50, y: 70 },
      { id: "s6", label: "6", x: 82, y: 70 },
    ],
  },
  {
    id: "terraza",
    name: "Terraza",
    tables: [
      { id: "t1", label: "7", x: 25, y: 35 },
      { id: "t2", label: "8", x: 70, y: 35 },
      { id: "t3", label: "9", x: 25, y: 75 },
      { id: "t4", label: "10", x: 70, y: 75 },
    ],
  },
];

/* ------------------------------------------------------------- inventario

   Cada ingrediente vive en su UNIDAD BASE (g, ml o pza): así lo escriben las
   recetas y así se descuenta al vender. Pero se COMPRA de otra forma — por
   libra, por galón, por caja de 50 vasos — y ahí es donde está el precio real
   que aparece en la factura.

   Por eso no se teclea el costo por gramo: se teclea lo que trae el empaque y
   lo que costó, y el sistema deriva el costo unitario. La conversión vive en
   src/lib/units.js y la aplica el servidor.

     I(id, nombre, unidadBase, stock, minStock, unidadCompra, contenido, precio)

   `contenido` = cuántas unidades base trae UNA unidad de compra.
   `precio`    = lo que cuesta UNA unidad de compra, en quetzales. */
const I = (id, name, unit, stock, minStock, purchaseUnit, purchaseFactor, purchasePrice) => ({
  id, name, unit, stock, minStock, purchaseUnit, purchaseFactor, purchasePrice,
});

// Equivalencias exactas, sin redondear (ver units.js: redondear el factor sí
// acumula error compra tras compra).
const LB = 453.59237;
const GAL = 3785.411784;

export const INGREDIENTS = [
  // --- Se compran por peso ---
  I("i_asai", "Asai en polvo", "g", 500, 250, "bolsa", 500, 195),
  I("i_fresa_cong", "Fresa congelada", "g", 2268, 900, "lb", LB, 22),
  I("i_matcha", "Matcha ceremonial", "g", 300, 100, "lata", 100, 85),
  I("i_cafe", "Café en grano", "g", 2268, 900, "lb", LB, 90),
  I("i_te_frutas", "Té de frutas", "g", 907, 450, "lb", LB, 68),
  I("i_azucar", "Azúcar", "g", 4536, 900, "lb", LB, 4),
  I("i_hielo", "Hielo", "g", 9072, 2268, "bolsa", 5 * LB, 10),

  // --- Se compran por volumen ---
  I("i_leche", "Leche entera", "ml", 11356, 3800, "gal", GAL, 45),
  I("i_leche_almendra", "Leche de almendra", "ml", 3000, 1000, "L", 1000, 28),
  I("i_agua", "Agua filtrada", "ml", 37800, 9450, "garrafón", 18900, 20),

  // --- Se compran por pieza o por empaque ---
  I("i_cheesecake_pz", "Cheesecake (rebanada)", "pza", 24, 6, "pastel", 12, 140),
  I("i_vaso", "Vaso 16 oz", "pza", 300, 100, "caja", 50, 60),
  I("i_tapa", "Tapa", "pza", 500, 150, "paquete", 100, 45),
  I("i_popote", "Popote", "pza", 500, 150, "paquete", 100, 20),
  I("i_plato", "Plato desechable", "pza", 150, 50, "paquete", 50, 45),
];

const R = (id, qty) => ({ id, qty });

/* Tamaños por onza. Se recibe (onzas, precio) tal como está impreso en el menú
   y se convierte a la diferencia sobre el más pequeño, que es lo que el sistema
   entiende. Teclear los deltas a mano invita a equivocarse al comparar con la
   carta. */
const oz = (...pares) => {
  const base = pares[0][1];
  return pares.map(([onzas, precio]) => ({ name: `${onzas} onz`, delta: precio - base, recipe: [] }));
};


/* Tamaños de arranque para un producto nuevo en el editor de menú. En onzas,
   que es como está impresa la carta de Café del Valle; el gerente ajusta nombres y
   recargos desde la pantalla. */
export const SIZES_BEBIDA = [
  { name: "12 onz", delta: 0, recipe: [] },
  { name: "16 onz", delta: 5, recipe: [] },
];

/* ------------------------------------------------- modificadores y extras

   `delta` es lo que SUMA al precio del producto. Cero significa que la opción
   no cuesta: elegir cerdo o pollo, o el sabor del chai, no cambia la cuenta.

   Ninguna opción lleva `recipe` todavía. Es deliberado: mientras los productos
   no tengan receta cargada, un modificador que sí consumiera inventario haría
   que el sistema creyera que la línea está costeada y reportara un costo casi
   cero como si fuera exacto. Sin receta en ningún lado, la app avisa
   honestamente "vendido sin receta cargada". */
const M = (id, label, options, type = "single") => ({ id, label, type, required: false, options });
/* `station` opcional: desvía ESA opción a otra estación de preparación. Sin
   ella el extra viaja con su producto, que es lo normal. Ver lib/stations.js. */
const O = (name, delta = 0, station) => ({ name, delta, ...(station ? { station } : {}) });

const TOPPINGS = [
  "Avena", "Granola", "Chispas de chocolate", "Coco rallado", "Oreo", "Pecanas",
  "Mantequilla de maní", "Almendra", "Chía", "Banano", "Fresa", "Papaya", "Mora",
].map((n) => O(n));

const MOD_LECHE = {
  id: "leche",
  label: "Leche",
  type: "single",
  required: false,
  options: [
    { name: "Entera", delta: 0 },
    /* Deslactosada sin recargo: la carta impresa no le pone precio, y cobrar
       algo que el cliente no ve anunciado genera discusión en caja. Si el
       negocio decide cobrarla, se cambia el delta desde el editor de menú.

       Tampoco lleva `swap` todavía: apuntar a un ingrediente que no existe haría
       que esa leche se descontara de la nada. Cuando se cargue el inventario
       real hay que crear "Leche deslactosada" y añadir aquí el intercambio,
       igual que tiene la de almendra. */
    { name: "Deslactosada", delta: 0 },
    // swap: cambia TODA la leche entera del producto por la alternativa, así
    // da igual si la bebida lleva 120 o 180 ml y si el tamaño la aumentó.
    { name: "Almendra", delta: 5, swap: { from: "i_leche", to: "i_leche_almendra" } },
  ],
};

export const MOD_GROUPS = {
  leche: MOD_LECHE,
  azucar: M("azucar", "Nivel de azúcar", [O("0%"), O("25%"), O("50%"), O("100%")]),
  // "Café incluido" lleva destino barra: en un plato de cocina el café lo
  // prepara el barista, mientras el resto del plato se queda en la cocina.
  extras: M("extras", "Extras", [O("Shot extra", 6), O("Café incluido", 0, "barra"), O("Aguacate", 5), O("Frijol volteado", 3)], "multi"),

  // --- comida ---
  proteina: M("proteina", "Proteína", [O("Cerdo"), O("Pollo empanizado")]),
  huevo: M("huevo", "Huevos al gusto", [O("Revueltos"), O("Estrellados"), O("Poché")]),
  chips: M("chips", "Acompañamiento", [O("Agrega chips", 5)], "multi"),

  // --- bebidas ---
  tipo_choc: M("tipo_choc", "Chocolate", [O("Oscuro"), O("Blanco")]),
  sabor_chai: M("sabor_chai", "Sabor del chai", [O("Vainilla"), O("Especias"), O("Flamingo"), O("Té verde")]),
  sabor_endulzado: M("sabor_endulzado", "Endulzado con", [O("Vainilla"), O("Avellana")]),
  /* El chocolate se sirve con agua y la leche es un extra de Q5 (así lo anuncia
     la carta). El tipo de leche va en el MISMO selector para no preguntar dos
     veces: "¿con leche?" y luego "¿qué leche?" cuando la respuesta pudo ser
     que no. */
  con_leche: M("con_leche", "Preparación", [
    O("Con agua"), O("Con leche entera", 5), O("Con leche deslactosada", 5), O("Con leche de almendra", 10),
  ]),

  // --- bowls y waffles ---
  toppings2: M("toppings2", "Elige 2 toppings", TOPPINGS, "multi"),
  toppings3: M("toppings3", "Elige 3 toppings", TOPPINGS, "multi"),
  nutella: M("nutella", "Extra", [O("Con nutella", 3)], "multi"),
  miel: M("miel", "Endulzante", [O("Miel de abeja"), O("Maple")]),
  base_waffle: M("base_waffle", "Base", [O("2 waffles"), O("3 pancakes")]),
  toppings_waffle: M("toppings_waffle", "Elige 3 toppings", [
    O("Fresas"), O("Helado"), O("Crema batida"), O("Papaya"), O("Banano"),
    O("Chispas"), O("Oreo"), O("Granola"), O("Chía"), O("Pecanas"),
  ], "multi"),
  relleno: M("relleno", "Elige un relleno", [
    O("Dulce de leche"), O("Leche condensada"), O("Nutella"),
    O("Jalea de mora"), O("Maple"), O("Miel de abeja"),
  ]),

  // --- postres ---
  fruta_crepa: M("fruta_crepa", "Fruta", [O("Fresa"), O("Banano"), O("Mixta")]),
  sabor_thangulu: M("sabor_thangulu", "Sabor", [O("Uva"), O("Fresa"), O("Mixta")]),
  sabor_sando: M("sabor_sando", "Sabor", [
    O("Frutos rojos"), O("Melocotón"), O("Fresa"), O("Uva verde"), O("Mora"),
  ]),
  cobertura: M("cobertura", "Cobertura", [O("Sin cobertura"), O("Con cobertura", 4)]),
  // El menú anuncia un rango: el cajero fija cuál del día está cobrando.
  precio_dia: M("precio_dia", "Precio del día", [O("Q30"), O("Q35", 5)]),
};

/* Menú de Café del Valle. `price` es el precio del tamaño MÁS PEQUEÑO; cada tamaño mayor
   lleva su diferencia en `delta`, igual que los modificadores. Así el precio de
   un producto sigue siendo un solo número y el recargo queda explícito.

   `recipe: []` en todos: falta cargar qué insumo consume cada platillo. Hasta
   que se carguen, el inventario no se descuenta y la ganancia neta avisa
   "vendido sin receta cargada" en vez de inventar un costo. */
export const PRODUCTS = [
  /* Menú corto de pruebas (5 productos). Cubre a propósito los tres caminos
     que conviene ejercitar al rediseñar: producto simple, producto con tamaños
     y producto con modificadores; y reparte estación entre barra y cocina para
     que se pruebe también la comanda impresa. */

  { id: 'p_espresso', cat: 'cafe', name: 'Espresso', price: 12, desc: 'Doble shot de la casa', icon: '☕',
    sizes: null, mods: ['azucar'], recipe: [] },

  { id: 'p_capuchino', cat: 'cafe', name: 'Capuchino', price: 22, desc: 'Espresso con leche vaporizada y espuma', icon: '☕',
    sizes: SIZES_BEBIDA, mods: ['leche', 'azucar', 'extras'], recipe: [] },

  { id: 'p_croissant', cat: 'panaderia', name: 'Croissant de mantequilla', price: 15, desc: 'Hojaldre horneado el mismo día', icon: '🥐',
    sizes: null, mods: [], recipe: [] },

  { id: 'p_tres_leches', cat: 'postres', name: 'Tres leches', price: 30, desc: 'Bizcocho tradicional bañado, porción generosa', icon: '🍰',
    sizes: null, mods: [], recipe: [] },

  { id: 'p_sandwich_pavo', cat: 'comida', name: 'Sándwich de pavo', price: 45, desc: 'Pavo, queso, aguacate y pesto en pan artesanal', icon: '🥪',
    sizes: null, mods: ['extras'], recipe: [] },
];
