/* SETTINGS
   Everything Laura may want to change lives in this one file.
   Text that visitors read has a Danish (da) and an English (en) version.
   The rest of the site text is in js/i18n.js. */

const CONFIG = {
  // From Supabase: Project settings, then API Keys (see LÆS-MIG.txt). Leave both empty to run the site in demo mode.
  // supabaseAnonKey: the "publishable" key (sb_publishable_...) or the older "anon" key. Both are meant to be public.
  // NEVER paste the secret / service_role key here.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Contact form. Create a free form at formspree.io and paste its address here.
  formspreeEndpoint: "https://formspree.io/f/YOUR_FORM_ID",

  defaultLanguage: "da",

  // The auction is hidden for now (it will move to auction.net and be embedded later).
  // All auction code is still here: set this to true to bring back the menu item,
  // the auction page, the "bid" buttons and the auction texts.
  showAuction: false,

  // MobilePay: the number buyers pay to. The message they must write is made automatically
  // from the order (order number + what they bought), so each payment can be matched to its order.
  mobilepay: { number: "+45 93 96 30 60", name: "Laura Kruuse" },

  // Most prints of the same painting one person (same e-mail or phone) can buy in total.
  // Keep the same as max_per_person in supabase-setup.sql.
  maxPerPerson: 10,

  // With pickup, the buyer may pay this share (%) now with MobilePay and the rest in person at pickup.
  // Set to 0 to turn the option off. Keep the same as deposit_percent in supabase-setup.sql.
  depositPercent: 50,

  contact: {
    email: "laur723kru@gmail.com",
    instagram: { url: "https://www.instagram.com/laur_kru", handle: "@laur_kru" },
    tiktok: { url: "https://www.tiktok.com/@hassel_art", handle: "@hassel_art" }
  },

  // Prices in DKK. Keep "ship" the same as in supabase-setup.sql.
  shipping: { ship: 59, pickup: 0 },
  reserveHours: 48,
  pickupText: { da: "Hent selv foran Odense Banegård Center, Østre Stationsvej 29, 5000 Odense. Vi aftaler et tidspunkt", en: "Pick up in person in front of Odense Banegård Center, Østre Stationsvej 29, 5000 Odense. We agree on a time" },
  giftNote: { da: "Alle printordrer får en lille overraskelse med fra atelieret.", en: "Every print order comes with a small surprise from the studio." }
};

/* Pictures: put them in the images folder. w and h are the picture's size in pixels,
   so the site can show each one at its own shape without cropping.
   Newest first: the portfolio and the print shop show them in this order.
   shop: false = only in the portfolio, not for sale as prints.
   Fill in medium, size, year and description when known. Anything left empty is simply hidden. */
const ARTWORKS = [
  {
    id: "will-you-catch-me",
    title: "WILL YOU CATCH ME?",
    image: "images/paintings/will-you-catch-me.jpg", w: 1300, h: 1629,
    size: "80 × 60 cm",
    year: "2026",
    medium: { da: "Akryl på lærred", en: "Acrylic on canvas" },
    description: {
      da: "Nogle gange føles livet, som om man bare falder, uden nogen til at gribe én, selvom man bliver ved med at skrige efter nogen, der kan redde én.",
      en: "Sometimes life feels like you’re just falling, with nobody to catch you, even though you keep screaming for someone to save you."
    }
  },
  {
    id: "eurowoman-illy",
    title: "EUROWOMAN × ILLY",
    shop: false,
    image: "images/paintings/eurowoman-illy.jpg", w: 1300, h: 1838,
    size: "",
    year: "2026",
    medium: { da: "Akvarel på papir", en: "Watercolour on paper" },
    description: {
      da: "Det er tit de små øjeblikke, der betyder mest. En bænk ved vandet, en kop kaffe og en skulder at hvile hovedet på. Malet til Eurowoman × illy-konkurrencen.",
      en: "It’s often the small moments that mean the most. A bench by the water, a cup of coffee and a shoulder to rest your head on. Painted for the Eurowoman × illy competition."
    }
  },
  {
    id: "ember",
    title: "EMBER",
    shop: false,
    image: "images/paintings/ember.jpg", w: 1300, h: 1798,
    size: "",
    year: "2025",
    medium: { da: "Akryl på lærred", en: "Acrylic on canvas" },
    description: {
      da: "Hun siger ikke noget, men det behøver hun heller ikke. Nogle gange kan man mærke varmen fra et menneske, bare ved at se på dem.",
      en: "She doesn’t say anything, but she doesn’t need to. Sometimes you can feel the warmth of a person just by looking at them."
    }
  },
  {
    id: "vestige",
    title: "VESTIGE",
    image: "images/paintings/vestige.jpg", w: 666, h: 891,
    size: "80 × 60 cm",
    year: "2025",
    medium: { da: "Akryl med tørrede blomster og guldfarvede ginkgoblade på lærred", en: "Acrylic with dried flowers and gold ginkgo leaves on canvas" },
    description: {
      da: "Nogle ting forsvinder, men efterlader alligevel et lille spor. Det, der engang blomstrede, kan stadig være smukt, også når det er visnet.",
      en: "Some things disappear but still leave a little trace behind. What once bloomed can still be beautiful, even after it has withered."
    }
  },
  {
    id: "florere",
    title: "FLORERE",
    image: "images/paintings/florere.jpg", w: 1300, h: 1752,
    size: "60 × 80 cm",
    year: "2025",
    medium: { da: "Akryl og ægte blomster på lærred", en: "Acrylics and real flowers on canvas" },
    description: {
      da: "Nogle gange kan det være svært at se sin egen vækst. Men for omverdenen blomstrer du så smukt, mens du bliver den bedste udgave af dig selv.",
      en: "Sometimes it can be hard to see your own growth. But to the outside world, you are blooming so beautifully while becoming the best version of yourself."
    }
  },
  {
    id: "lunar-solitude",
    title: "LUNAR SOLITUDE",
    shop: false,
    image: "images/paintings/lunar-solitude.jpg", w: 1300, h: 1391,
    size: "40 × 40 cm",
    year: "",
    medium: { da: "Akryl på lærred. Månen har en 3D-effekt lavet af genbrugt akrylmaling", en: "Acrylic on canvas. The moon has a 3D effect made from recycled acrylic paint" },
    description: {
      da: "Der er dage, hvor man bare har brug for at komme helt væk fra det hele. Et sted hvor der er stille, og hvor man kan være alene med sine egne tanker.",
      en: "There are days when you just need to get far away from it all. Somewhere quiet, where you can be alone with your own thoughts."
    }
  },
  {
    id: "marasme",
    title: "MARASME",
    shop: false,
    image: "images/paintings/marasme.jpg", w: 1300, h: 1388,
    size: "40 × 40 cm",
    year: "",
    medium: { da: "Akryl på lærred", en: "Acrylic on canvas" },
    description: {
      da: "Det kan føles som om, at alt omkring én bare kører videre, mens man selv står helt stille og ikke ved, hvor man skal gå hen.",
      en: "It can feel like everything around you just keeps going, while you stand completely still, not knowing where to go."
    }
  },
  {
    id: "flicker",
    title: "FLICKER",
    shop: false,
    image: "images/paintings/flicker-web.jpg", w: 1300, h: 1397,
    size: "40 × 40 cm",
    year: "",
    medium: { da: "Akryl på lærred", en: "Acrylic on canvas" },
    description: {
      da: "Når alt omkring én er mørkt, er det det lille lys, man holder fast i. Det blafrer lidt, men det er nok til at finde vej.",
      en: "When everything around you is dark, it’s the little light you hold on to. It flickers a bit, but it’s enough to find your way."
    }
  },
  {
    id: "midt-om-natten",
    title: "MIDT OM NATTEN",
    shop: false,
    image: "images/paintings/midt-om-natten.jpg", w: 437, h: 1300,
    size: "",
    year: "",
    medium: { da: "Akryl på lærred", en: "Acrylic on canvas" },
    description: {
      da: "Om natten bliver byen helt stille, men lysene bliver ved med at bevæge sig. Hver lille prik er nogen, der er på vej hjem.",
      en: "At night the city goes completely quiet, but the lights keep moving. Every little dot is someone on their way home."
    }
  }
];
/* Paintings that are for sale as prints */
const forSale = (a) => a.shop !== false;

const SKETCHES = [
  { title: { da: "Håndstudie", en: "Hand Study" }, image: "images/paintings/hand_sketch.jpg", w: 613, h: 574,
    medium: { da: "Maling på lærred", en: "Paint on canvas" },
    desc: { da: "Et studie af hænder og perler, med fokus på form, lys og proportioner.", en: "A study of hands and pearls, focusing on form, light and proportion." } },
  { title: { da: "Skitse til Eurowoman × illy", en: "Sketch for Eurowoman × illy" }, image: "images/paintings/illy-sketch.jpg", w: 975, h: 1300,
    medium: { da: "Blyant på papir", en: "Pencil on paper" },
    desc: { da: "Den første blyantskitse til maleriet til Eurowoman × illy-konkurrencen.", en: "The first pencil sketch for the painting for the Eurowoman × illy competition." } },
  { title: { da: "Portræt i kul", en: "Portrait in Charcoal" }, image: "images/paintings/sketch1.jpg", w: 236, h: 367,
    medium: { da: "Kul på papir", en: "Charcoal on paper" },
    desc: { da: "Tegning bygget op af skygger, der undersøger dybde og kontrast.", en: "Shadow-based drawing, exploring depth and contrast." } },
  { title: { da: "Billie Eilish-skitse", en: "Billie Eilish Sketch" }, image: "images/paintings/sketch2.jpg", w: 239, h: 360,
    medium: { da: "Grafit på papir", en: "Graphite on paper" },
    desc: { da: "Et detaljeret portrætstudie med omhyggelig skyggelægning og sans for proportioner.", en: "A detailed portrait study with careful shading and attention to proportion." } },

  /* Only on the board in the portfolio (home: false keeps them out of "Fra atelieret" on the front page) */
  { home: false, title: { da: "Hånd med perler", en: "Hand with Pearls" }, image: "images/paintings/haand.jpg", w: 975, h: 1300,
    medium: { da: "Maling på lærred", en: "Paint on canvas" },
    desc: { da: "En hånd der holder en perlekæde, malet mod en dyb grøn baggrund.", en: "A hand holding a string of pearls, painted against a deep green background." } },
  { home: false, title: { da: "Daydream", en: "Daydream" }, image: "images/paintings/tegning-af-pige.jpg", w: 975, h: 1300,
    medium: { da: "Blyant på papir", en: "Pencil on paper" },
    desc: { da: "En pige med blomster i håret, tegnet i skitsebogen en stille dag.", en: "A girl with flowers in her hair, drawn in the sketchbook on a quiet day." } }
];

/* Watercolours of animals and nature, shown in their own corner of the portfolio after the sketch board */
const NATURE = [
  { title: { da: "Fuglen i vindueskarmen", en: "Bird on the Windowsill" }, image: "images/paintings/fugl.jpg", w: 1300, h: 975,
    medium: { da: "Akvarel på papir", en: "Watercolour on paper" },
    desc: { da: "En lille fugl hviler i vindueskarmen mellem grønne grene og røde blomster.", en: "A small bird resting on the windowsill between green branches and red flowers." } },
  { title: { da: "Forår!", en: "Spring!" }, image: "images/paintings/ko.jpg", w: 1300, h: 903, year: "2025",
    medium: { da: "Akvarel på papir", en: "Watercolour on paper" },
    desc: { da: "En ko på marken i akvarel.", en: "A cow in a field in watercolour." } }
];

/* Instagram posts shown in the carousel on the front page. Picture posts only (no videos/reels).
   Paste the post's link from Instagram ("Copy link"). Newest first. */
const INSTAGRAM_POSTS = [
  "https://www.instagram.com/p/Df1s-fMDH35/",
  "https://www.instagram.com/p/Dfzt7xlDBoy/",
  "https://www.instagram.com/p/DZrucDmDABw/",
  "https://www.instagram.com/p/DY9ZPxFDLpt/",
  "https://www.instagram.com/p/DXT4fSpDLQn/",
  "https://www.instagram.com/p/DWRFnWMDKQU/"
];

const COMING_SOON = [
  { topic: "stickers",
    title: { da: "Klistermærker og småting", en: "Stickers and small merch" },
    text: { da: "Klistermærker med malerierne, som du kan købe for sig eller få med som en lille gave til din printordre.", en: "Stickers of the paintings, to buy on their own or tucked into a print order as a little gift." } },
  { topic: "sizes",
    title: { da: "Flere printstørrelser", en: "More print sizes" },
    text: { da: "Mindre og større formater, når 50 × 70 cm-oplagene har fundet deres hjem.", en: "Smaller and larger formats, once the 50 × 70 cm editions have found their homes." } },
  { topic: "new-work",
    title: { da: "Nye originaler", en: "New originals" },
    text: { da: "Der står nye malerier på staffeliet, og det næste kommer på auktion, når det er færdigt.", en: "New paintings are on the easel, and the next one goes up for auction when it’s finished." },
    // used while the auction is hidden (showAuction: false)
    textNoAuction: { da: "Der står nye malerier på staffeliet, og de næste kommer snart på siden.", en: "New paintings are on the easel, and the next ones will be on the site soon." } }
];
