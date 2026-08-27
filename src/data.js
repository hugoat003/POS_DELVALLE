/* FUWA POS — datos del menú, categorías, tamaños y modificadores.
   Moneda: Quetzal (Q). Precios ya incluyen impuestos. */

// Colores pastel kawaii derivados de un tono (hue) para mantener consistencia
// entre categorías nuevas y existentes (misma chroma/lightness, varía el hue).
export function catColors(hue) {
  return { tint: `oklch(0.90 0.055 ${hue})`, ink: `oklch(0.45 0.09 ${hue})` };
}

const C = (id, name, icon, hue, station = "barra") => ({ id, name, icon, hue, station, ...catColors(hue) });

/* Categorías por defecto (editables desde el editor de menú).

   `station` decide a dónde va el item al enviar la orden: "barra" aparece en el
   tablero del barista y "cocina" imprime comanda en la impresora de cocina.
   Ver src/lib/stations.js. */
export const CATEGORIES = [
  /* Los 14 tonos van repartidos cada ~26° en la rueda de color. Agrupar por
     tipo (comida cálida / bebida fría) dejaba pares casi idénticos —japonesas y
     burguers salían del mismo rosa— y en una tablet a distancia de brazo eso
     hace tocar la categoría equivocada. Distinguirlas pesa más que agruparlas:
     el destino de preparación ya lo dice `station`.

     Las dos de matcha son la excepción buscada: caen juntas en el verde (129 y
     154) porque el mesero las piensa como una familia. */
  C("japonesas", "Japonesas", "🍱", 0, "cocina"),
  C("burguers", "Burguers", "🍔", 26, "cocina"),
  C("desayunos", "Desayunos", "🍳", 51, "cocina"),
  C("brunch", "Brunch", "🥐", 77, "cocina"),
  C("crepas", "Crepas y Waffles", "🧇", 103, "cocina"),
  C("matcha_trad", "Matcha Tradicional", "🍵", 129, "barra"),
  C("matcha_cer", "Matcha Ceremonial", "🌿", 154, "barra"),
  C("bowls", "Bowls", "🥣", 180, "cocina"),
  C("calientes", "Bebidas Calientes", "☕", 206, "barra"),
  C("te", "Té e Infusiones", "🫖", 231, "barra"),
  C("frias", "Bebidas Frías", "🧊", 257, "barra"),
  C("einspanner", "Einspanner", "🥛", 283, "barra"),
  C("frappes", "Frappés", "🥤", 309, "barra"),
  C("postres", "Postres", "🍮", 334, "cocina"),
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
   que es como está impresa la carta de FUWA; el gerente ajusta nombres y
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
const O = (name, delta = 0) => ({ name, delta });

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
  extras: M("extras", "Extras", [O("Shot extra", 6)], "multi"),

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

/* Menú de FUWA. `price` es el precio del tamaño MÁS PEQUEÑO; cada tamaño mayor
   lleva su diferencia en `delta`, igual que los modificadores. Así el precio de
   un producto sigue siendo un solo número y el recargo queda explícito.

   `recipe: []` en todos: falta cargar qué insumo consume cada platillo. Hasta
   que se carguen, el inventario no se descuenta y la ganancia neta avisa
   "vendido sin receta cargada" en vez de inventar un costo. */
export const PRODUCTS = [

  // ═══ ESPECIALIDADES JAPONESAS ═══
  { id: 'p_baos', cat: 'japonesas', name: 'Baos', price: 35, desc: 'Panecillo al vapor, suave y esponjoso', icon: '🥟',
    sizes: [{ name: '1 pieza', delta: 0, recipe: [] }, { name: '2 piezas', delta: 20, recipe: [] }, { name: '4 piezas', delta: 70, recipe: [] }], mods: ['proteina'], recipe: [] },
  { id: 'p_katsu_sando', cat: 'japonesas', name: 'Katsu Sando', price: 50, desc: 'Sandwich japonés en pan brioche de la casa, rábano, pepinillos, cebolla y lechuga. Incluye papas fritas', icon: '🥪',
    sizes: null, mods: ['proteina'], recipe: [] },
  { id: 'p_buta_sando', cat: 'japonesas', name: 'Buta Sando', price: 59, desc: 'Un mega katsu: cerdo empanizado, zanahoria especial, lechuga, repollo y aderezo de la casa. Incluye papas fritas', icon: '🥪',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_sando_adobado', cat: 'japonesas', name: 'Sando Adobado', price: 50, desc: 'Pollo adobado con piña, aguacate, pepinillos y cebolla. Incluye papas fritas', icon: '🥪',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_corn_dog', cat: 'japonesas', name: 'Corn Dog', price: 35, desc: 'Banderilla japonesa con aderezo de la casa', icon: '🌭',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_gyozas', cat: 'japonesas', name: 'Gyozas', price: 55, desc: 'Empanadas fritas con carne de cerdo. Porción de 5, con salsa soya tori japan', icon: '🥟',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_orange_chicken', cat: 'japonesas', name: 'Orange Chicken', price: 48, desc: 'Pollo a la naranja con arroz de la casa', icon: '🍗',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_chiky_sando', cat: 'japonesas', name: 'Chiky Sando', price: 49, desc: 'Pan brioche, pollo, aguacate, repollo, rábano, salsa de queso y papalinas', icon: '🥪',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_osaka_sando', cat: 'japonesas', name: 'Osaka Sando', price: 49, desc: 'Pan brioche, cerdo con japonesa, sriracha, alfalfa, rábano y papalinas', icon: '🥪',
    sizes: null, mods: [], recipe: [] },

  // ═══ BURGUERS ═══
  { id: 'p_burg_gochujang', cat: 'burguers', name: 'Gochujang', price: 55, desc: 'Pollo empanizado bañado en gochujang, repollo, salsa de la casa y pepinillos. Incluye papas fritas', icon: '🍔',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_burg_teriyaki', cat: 'burguers', name: 'Teriyaki', price: 55, desc: 'Cerdo empanizado con teriyaki, salsa chipotle, tomate, cebolla, pepinillo y lechuga. Incluye papas fritas', icon: '🍔',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_burg_demon', cat: 'burguers', name: 'Demon', price: 60, desc: 'Cerdo, picante demon, lechuga, tomate, aros de cebolla, cebolla caramelizada, tocino, alfalfa y pepinillo. Incluye papas fritas', icon: '🔥',
    sizes: null, mods: [], recipe: [] },

  // ═══ DESAYUNOS · 8:30 a 11:30 AM ═══
  { id: 'p_des_chapin', cat: 'desayunos', name: 'Chapín', price: 40, desc: 'Huevos al gusto, plátanos fritos, frijoles volteados, chirmol, queso y fruta del día', icon: '🍳',
    sizes: null, mods: ['huevo'], recipe: [] },
  { id: 'p_des_jhony', cat: 'desayunos', name: 'Jhony English', price: 55, desc: 'Huevo revuelto japonés, queso flameado, salchicha ahumada, waffle con mermelada y crema batida', icon: '🍳',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_des_omelette', cat: 'desayunos', name: 'Omelette Kawai', price: 48, desc: 'Queso mozzarella, cebolla, pimiento y tomate. Con frijol y plátano', icon: '🍳',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_des_chilaquiles', cat: 'desayunos', name: 'Chilaquiles Verdes', price: 55, desc: 'Tiras de tortilla frita con salsa verde, pollo y queso criollo', icon: '🌶️',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_des_primavera', cat: 'desayunos', name: 'Tostada Primavera', price: 55, desc: 'Pan dulce con crema especial, banano y arándano + pan salado con jamón serrano y huevo estrellado con alfalfa', icon: '🍞',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_des_cilbir', cat: 'desayunos', name: 'Cilbir Eggs', price: 59, desc: 'Huevos poché sobre yogurt natural con especias y derretido de tres quesos. Desayuno turco', icon: '🥚',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_waffle_propio', cat: 'desayunos', name: 'Crea tu Waffle o Pancake', price: 45, desc: 'Escoge 2 waffles o 3 pancakes, 3 toppings y un relleno', icon: '🧇',
    sizes: null, mods: ['base_waffle', 'toppings_waffle', 'relleno'], recipe: [] },
  { id: 'p_waffle_avena', cat: 'desayunos', name: 'Waffle de Avena', price: 38, desc: 'Waffle de avena con banano, fresa y miel de abeja natural', icon: '🧇',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_panquequitos', cat: 'desayunos', name: 'Panquequitos para Niños', price: 38, desc: 'Dos panqueques con fruta de la temporada y crema batida', icon: '🥞',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_americano_kids', cat: 'desayunos', name: 'Americano Kids', price: 40, desc: 'Huevo revuelto, tocino y waffle con fruta', icon: '🥓',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_ciabatta_chapin', cat: 'desayunos', name: 'Ciabatta Chapín', price: 29, desc: 'Pan ciabatta de la casa con huevo revuelto, frijol y chirmol a la plancha', icon: '🥖',
    sizes: null, mods: ['chips'], recipe: [] },
  { id: 'p_ciabatta_chicken', cat: 'desayunos', name: 'Ciabatta Chicken', price: 35, desc: 'Pan ciabatta de la casa, pollo a la plancha, aderezo de chipotle, queso y aguacate', icon: '🥖',
    sizes: null, mods: ['chips'], recipe: [] },

  // ═══ BRUNCH · todo el día ═══
  { id: 'p_toast_berry', cat: 'brunch', name: 'Toast Berry Fuwa', price: 45, desc: 'Baguette de masa madre de la casa tostado, con frutos rojos', icon: '🍓',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_toast_kumo', cat: 'brunch', name: 'Toast Kumo Peanut', price: 40, desc: 'Baguette de masa madre de la casa tostado, con mantequilla de maní', icon: '🥜',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_toast_hinode', cat: 'brunch', name: 'Toast Hinode', price: 40, desc: 'Baguette de masa madre de la casa tostado, con tomate asado y huevo', icon: '🍅',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_egg_club', cat: 'brunch', name: 'Egg Sandwich Club', price: 43, desc: 'Huevo revuelto en pan brioche, queso mozzarella y alioli de sriracha. Cama de champiñones y cebolla morada', icon: '🥪',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_tostada_brule', cat: 'brunch', name: 'Tostada Brulé', price: 45, desc: 'Tostada a la francesa con frutos rojos y helado de vainilla', icon: '🍞',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_toston', cat: 'brunch', name: 'Tostón', price: 40, desc: 'Tostada de maíz con alioli de chipotle, ajonjolí negro, aguacate, tocino y huevo estrellado. Con frijol y platanitos fritos', icon: '🌽',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_strawberry_pancakes', cat: 'brunch', name: 'Strawberry Pancakes', price: 40, desc: 'Panqueques con fresa y nutella', icon: '🥞',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_chicken_little', cat: 'brunch', name: 'Chicken Little', price: 45, desc: 'Ciabatta de la casa con pollo en salsa de chipotle, queso mozzarella, aguacate y tocino', icon: '🍗',
    sizes: null, mods: [], recipe: [] },

  // ═══ CREPAS Y WAFFLES ═══
  { id: 'p_crepa_mora', cat: 'crepas', name: 'Crepa de Mora', price: 40, desc: 'Estilo sushi, con crema de mora', icon: '🫐',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_crepa_nutella', cat: 'crepas', name: 'Crepa Nutella', price: 40, desc: 'Estilo sushi', icon: '🍫',
    sizes: null, mods: ['fruta_crepa'], recipe: [] },
  { id: 'p_crepa_mani', cat: 'crepas', name: 'Crepa Mantequilla de Maní', price: 40, desc: 'Crema especial de mantequilla de maní', icon: '🥜',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_crepa_fresas', cat: 'crepas', name: 'Crepa Fresas con Crema', price: 45, desc: 'Crepa doble con crema de la casa, leche condensada y fresas', icon: '🍓',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_crepa_pistacho', cat: 'crepas', name: 'Crepa de Pistacho', price: 45, desc: 'Crema de pistacho, nutella, helado de vainilla y chocolate oscuro', icon: '🥐',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_waffle_pistacho', cat: 'crepas', name: 'Waffle Pistacho', price: 45, desc: 'Crema de pistacho, chocolate blanco y oscuro con helado de vainilla', icon: '🧇',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_waffle_sensei', cat: 'crepas', name: 'Waffle Sensei', price: 45, desc: 'Waffle salado esponjoso sobre huevo estrellado, tocino, ajonjolí negro y aguacate', icon: '🧇',
    sizes: null, mods: [], recipe: [] },

  // ═══ BOWLS ═══
  { id: 'p_bowl_acai', cat: 'bowls', name: 'Açaí', price: 45, desc: 'Crema especial de banano, topping de fresa y banano. Elige 2 toppings', icon: '🫐',
    sizes: null, mods: ['toppings2', 'nutella'], recipe: [] },
  { id: 'p_bowl_esscence', cat: 'bowls', name: 'Esscence', price: 45, desc: 'Yogurt griego con frutos rojos, granola, pecanas y naranja', icon: '🥣',
    sizes: null, mods: ['miel'], recipe: [] },
  { id: 'p_bowl_happy', cat: 'bowls', name: 'Happy Day', price: 45, desc: 'Yogurt de mora y frutos rojos. Elige 3 toppings', icon: '🍇',
    sizes: null, mods: ['toppings3'], recipe: [] },
  { id: 'p_bowl_matcha', cat: 'bowls', name: 'Matcha Bowl', price: 50, desc: 'Yogurt con matcha ceremonial. Elige 3 toppings', icon: '🍵',
    sizes: null, mods: ['toppings3'], recipe: [] },

  // ═══ POSTRES Y MÁS ═══
  { id: 'p_mochi', cat: 'postres', name: 'Mochi', price: 18, desc: 'Sabor del día', icon: '🍡',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_sando_dulce', cat: 'postres', name: 'Sando', price: 42, desc: 'Un sabor', icon: '🍰',
    sizes: null, mods: ['sabor_sando'], recipe: [] },
  { id: 'p_sando_mixto', cat: 'postres', name: 'Sando Mixto', price: 45, desc: 'Dos sabores', icon: '🍰',
    sizes: null, mods: ['sabor_sando'], recipe: [] },
  { id: 'p_thangulu', cat: 'postres', name: 'Thangulu', price: 25, desc: 'Golosina japonesa de fruta cristalizada', icon: '🍭',
    sizes: null, mods: ['sabor_thangulu'], recipe: [] },
  { id: 'p_tiramisu', cat: 'postres', name: 'Tiramisú Japan', price: 32, desc: '', icon: '🍮',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_affogato', cat: 'postres', name: 'Affogato + Brownie', price: 40, desc: 'Espresso con helado de vainilla y brownie', icon: '🍨',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_salad_kyoto', cat: 'postres', name: 'Salad Kyoto Mix', price: 49, desc: 'Mix de lechugas, pepino, pollo a la plancha, pecana, fresa, queso y cebolla con aderezo mostaza miel', icon: '🥗',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_yuki_berry', cat: 'postres', name: 'Yuki Berry', price: 35, desc: 'Brownie con helado, chocolate y fresa', icon: '🍫',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_crumbl', cat: 'postres', name: 'Crumbl Cookie', price: 18, desc: '', icon: '🍪',
    sizes: null, mods: ['cobertura'], recipe: [] },
  { id: 'p_cheescake', cat: 'postres', name: 'Cheescake', price: 30, desc: 'Preguntar por los del día', icon: '🍰',
    sizes: null, mods: ['precio_dia'], recipe: [] },
  { id: 'p_pastel', cat: 'postres', name: 'Pastel', price: 30, desc: 'Preguntar por los del día', icon: '🎂',
    sizes: null, mods: ['precio_dia'], recipe: [] },
  { id: 'p_brownie_twixie', cat: 'postres', name: 'Brownie Twixie', price: 20, desc: 'Con cobertura del día', icon: '🍫',
    sizes: null, mods: [], recipe: [] },

  /* ═══ MENÚ DE MATCHA CEREMONIAL ═══
     Carta aparte de la principal. Las frías van primero y las calientes
     después, igual que impresa; el icono distingue unas de otras de un
     vistazo. Los sellos de la carta (endulzado / sin azúcar añadida) van en
     la descripción: son una característica del producto, no una opción. */
  { id: 'p_cm_cold_latte', cat: 'matcha_cer', name: 'Cold Matcha Latte', price: 30, desc: 'Frío · matcha, leche y hielo · sin azúcar añadida', icon: '🧊',
    sizes: null, mods: ['leche'], recipe: [] },
  { id: 'p_cm_blueberry', cat: 'matcha_cer', name: 'Blueberry Matcha', price: 35, desc: 'Frío · salsa de mora, matcha y leche', icon: '🫐',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_cm_cold_hojicha', cat: 'matcha_cer', name: 'Cold Hojicha Latte', price: 35, desc: 'Frío · matcha tostado y leche', icon: '🧊',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_cm_cocomatcha', cat: 'matcha_cer', name: 'Cocomatcha', price: 35, desc: 'Frío · agua de coco y nube de matcha · endulzado', icon: '🥥',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_cm_pinky_pro', cat: 'matcha_cer', name: 'Pinky Matcha Pro', price: 35, desc: 'Frío · jalea de fresa, leche y crema de matcha · endulzado', icon: '💗',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_cm_chigo_pro', cat: 'matcha_cer', name: 'Chigo Matcha Pro', price: 35, desc: 'Frío · jalea de fresa, leche rosa y crema de matcha · endulzado', icon: '🌸',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_cm_lotus', cat: 'matcha_cer', name: 'Matcha Lotus', price: 35, desc: 'Frío · leche y crema de matcha con vainilla · endulzado', icon: '🪷',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_cm_usucha', cat: 'matcha_cer', name: 'Usucha', price: 25, desc: 'Caliente · matcha con agua. El clásico japonés · sin azúcar añadida', icon: '🍵',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_cm_latte_pro', cat: 'matcha_cer', name: 'Matcha Latte Pro', price: 30, desc: 'Caliente · leche y matcha · sin azúcar añadida', icon: '☕',
    sizes: null, mods: ['leche'], recipe: [] },
  { id: 'p_cm_fuwa_sweet', cat: 'matcha_cer', name: 'Fuwa Sweet Matcha', price: 30, desc: 'Caliente · leche condensada, leche y matcha · endulzado', icon: '🍯',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_cm_hojicha', cat: 'matcha_cer', name: 'Hojicha Latte', price: 30, desc: 'Caliente · matcha tostado y leche · sin azúcar añadida', icon: '☕',
    sizes: null, mods: ['leche'], recipe: [] },
  { id: 'p_cm_moca_hojicha', cat: 'matcha_cer', name: 'Moca Hojicha Latte', price: 30, desc: 'Caliente · chocolate oscuro y matcha tostado · endulzado', icon: '🍫',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },

  // ═══ BEBIDAS CALIENTES ═══
  { id: 'p_americano', cat: 'calientes', name: 'Americano', price: 18, desc: '', icon: '☕',
    sizes: oz([8, 18], [12, 20], [13, 25]), mods: ['azucar'], recipe: [] },
  { id: 'p_latte', cat: 'calientes', name: 'Latte', price: 20, desc: '', icon: '☕',
    sizes: oz([8, 20], [12, 25], [13, 28]), mods: ['leche', 'azucar', 'extras'], recipe: [] },
  { id: 'p_capuchino', cat: 'calientes', name: 'Capuchino', price: 20, desc: '', icon: '☕',
    sizes: oz([8, 20], [12, 25], [13, 28]), mods: ['leche', 'azucar', 'extras'], recipe: [] },
  { id: 'p_latte_sakura', cat: 'calientes', name: 'Latte Sakura', price: 30, desc: '13 onz', icon: '🌸',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_flat_white', cat: 'calientes', name: 'Flat White', price: 18, desc: '6 onz · sabor fuerte, para amantes del café', icon: '☕',
    sizes: null, mods: ['leche'], recipe: [] },
  { id: 'p_dulce_pecado', cat: 'calientes', name: 'Dulce Pecado', price: 32, desc: 'Con leche condensada · 13 onz', icon: '🍯',
    sizes: null, mods: ['leche'], recipe: [] },
  { id: 'p_moca', cat: 'calientes', name: 'Moca o White', price: 25, desc: 'Chocolate + café', icon: '🍫',
    sizes: oz([8, 25], [12, 30]), mods: ['tipo_choc', 'leche', 'azucar'], recipe: [] },
  { id: 'p_grand_saint', cat: 'calientes', name: 'Grand Saint', price: 32, desc: 'Crema batida, chocolate y oreo · 15 onz', icon: '🍪',
    sizes: null, mods: ['leche'], recipe: [] },
  { id: 'p_caramel_malcriado', cat: 'calientes', name: 'Caramel Malcriado', price: 27, desc: '', icon: '🍮',
    sizes: oz([8, 27], [12, 30]), mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_nutelatte', cat: 'calientes', name: 'Nutelatte', price: 30, desc: '', icon: '🍫',
    sizes: oz([8, 30], [12, 35]), mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_latte_mani', cat: 'calientes', name: 'Latte Mantequilla de Maní', price: 30, desc: '12 onz', icon: '🥜',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_filtrado', cat: 'calientes', name: 'Filtrado en Origami o V60', price: 28, desc: '12 onz', icon: '☕',
    sizes: null, mods: ['azucar'], recipe: [] },
  { id: 'p_chai_latte', cat: 'calientes', name: 'Chai Latte', price: 30, desc: '12 onz', icon: '🫖',
    sizes: null, mods: ['sabor_chai', 'leche', 'azucar'], recipe: [] },
  { id: 'p_dirty_chai', cat: 'calientes', name: 'Dirty Chai', price: 35, desc: 'Café espresso + tu chai favorito', icon: '🫖',
    sizes: null, mods: ['sabor_chai', 'leche'], recipe: [] },
  { id: 'p_chocolate', cat: 'calientes', name: 'Chocolate', price: 23, desc: '', icon: '🍫',
    sizes: oz([8, 23], [12, 25]), mods: ['con_leche'], recipe: [] },
  { id: 'p_taro_cal', cat: 'calientes', name: 'Taro', price: 33, desc: '12 onz', icon: '💜',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_matcha_trad', cat: 'matcha_trad', name: 'Matcha', price: 35, desc: 'Tradicional sabor · 12 onz', icon: '🍵',
    sizes: null, mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_matcha_pro', cat: 'calientes', name: 'Matcha Pro', price: 38, desc: 'Grado ceremonial desde Japón', icon: '🍵',
    sizes: oz([12, 38], [13, 42]), mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_london_fog', cat: 'calientes', name: 'London Fog', price: 25, desc: 'Té inglés de bergamota y leche', icon: '🫖',
    sizes: oz([8, 25], [12, 30]), mods: ['leche', 'azucar'], recipe: [] },

  // ═══ INFUSIONES DE TÉ ═══
  { id: 'p_te_tetera', cat: 'te', name: 'Infusión en Tetera', price: 45, desc: 'Incluye 4 tazas de 5 onz', icon: '🫖',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_te_taza', cat: 'te', name: 'Infusión en Taza', price: 25, desc: 'Taza de 12 onz', icon: '🍵',
    sizes: null, mods: [], recipe: [] },

  // ═══ BEBIDAS FRÍAS ═══
  { id: 'p_iced_latte', cat: 'frias', name: 'Iced Latte', price: 22, desc: '', icon: '🧊',
    sizes: oz([12, 22], [16, 25]), mods: ['leche', 'azucar'], recipe: [] },
  { id: 'p_iced_latte_dulce', cat: 'frias', name: 'Iced Latte Endulzado', price: 23, desc: '', icon: '🧊',
    sizes: oz([12, 23], [16, 28]), mods: ['sabor_endulzado', 'leche'], recipe: [] },
  { id: 'p_caramelo_frio', cat: 'frias', name: 'Caramelo Malcriado', price: 25, desc: '', icon: '🍮',
    sizes: oz([12, 25], [16, 30]), mods: ['leche'], recipe: [] },
  { id: 'p_iced_moca', cat: 'frias', name: 'Iced Moca', price: 25, desc: '', icon: '🍫',
    sizes: oz([12, 25], [16, 30]), mods: ['tipo_choc', 'leche'], recipe: [] },
  { id: 'p_cold_brew', cat: 'frias', name: 'Cold Brew Jamaik', price: 30, desc: '12 onz', icon: '🧊',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_iced_chai', cat: 'frias', name: 'Iced Chai Latte', price: 27, desc: '', icon: '🫖',
    sizes: oz([12, 27], [16, 32]), mods: ['sabor_chai', 'leche'], recipe: [] },
  { id: 'p_iced_taro', cat: 'frias', name: 'Iced Taro', price: 30, desc: '', icon: '💜',
    sizes: oz([12, 30], [16, 35]), mods: ['leche'], recipe: [] },
  { id: 'p_iced_matcha', cat: 'matcha_trad', name: 'Iced Matcha', price: 32, desc: '', icon: '🍵',
    sizes: oz([12, 32], [16, 35]), mods: ['leche'], recipe: [] },
  { id: 'p_carajillo', cat: 'frias', name: 'Carajillo', price: 40, desc: 'Espresso con licor 43', icon: '🥃',
    sizes: null, mods: [], recipe: [] },
  { id: 'p_sakura_dragon', cat: 'frias', name: 'Sakura Refresher Dragon Fruit', price: 25, desc: 'Limonada con soda', icon: '🐉',
    sizes: oz([12, 25], [16, 30]), mods: [], recipe: [] },
  { id: 'p_sakura_maracuya', cat: 'frias', name: 'Sakura Refresher Maracuyá', price: 28, desc: 'Limonada con soda', icon: '🍋',
    sizes: oz([12, 28], [16, 32]), mods: [], recipe: [] },

  // ═══ EINSPANNER · bebidas japonesas con crema fuwa ═══
  { id: 'p_kohi_choco', cat: 'einspanner', name: 'Kohi Choco', price: 30, desc: 'Café y chocolate', icon: '🥛',
    sizes: oz([12, 30], [16, 35]), mods: ['leche'], recipe: [] },
  { id: 'p_chigo_rose', cat: 'einspanner', name: 'Chigo Rose', price: 30, desc: 'Leche de fresa y jalea de fresa', icon: '🌹',
    sizes: oz([12, 30], [16, 35]), mods: ['leche'], recipe: [] },
  { id: 'p_pinky_matcha', cat: 'einspanner', name: 'Pinky Matcha', price: 33, desc: 'Jalea de fresa y matcha', icon: '💗',
    sizes: oz([12, 33], [16, 38]), mods: ['leche'], recipe: [] },
  { id: 'p_blackberry_matcha', cat: 'einspanner', name: 'Blackberry Matcha', price: 33, desc: 'Salsa de mora y matcha azul tailandesa', icon: '🫐',
    sizes: oz([12, 33], [16, 38]), mods: ['leche'], recipe: [] },
  { id: 'p_cotaro', cat: 'einspanner', name: 'Cotaro', price: 30, desc: 'Agua de coco + taro', icon: '🥥',
    sizes: oz([12, 30], [16, 35]), mods: ['leche'], recipe: [] },

  // ═══ FRAPPÉS ═══
  { id: 'p_frappe_caramelo', cat: 'frappes', name: 'Frappé Caramelo', price: 32, desc: '', icon: '🥤',
    sizes: oz([12, 32], [16, 37]), mods: ['leche'], recipe: [] },
  { id: 'p_frappe_taro', cat: 'frappes', name: 'Frappé Taro', price: 32, desc: '', icon: '🥤',
    sizes: oz([12, 32], [16, 37]), mods: ['leche'], recipe: [] },
  { id: 'p_frappe_oreo', cat: 'frappes', name: 'Frappé Oreo', price: 32, desc: '', icon: '🥤',
    sizes: oz([12, 32], [16, 37]), mods: ['leche'], recipe: [] },
  { id: 'p_frappe_moca', cat: 'frappes', name: 'Frappé Moca', price: 32, desc: '', icon: '🥤',
    sizes: oz([12, 32], [16, 37]), mods: ['leche'], recipe: [] },
];
