/* SETTINGS
   Everything Laura may want to change lives in this one file.
   Text that visitors read has a Danish (da) and an English (en) version.
   The rest of the site text is in js/i18n.js. */

const CONFIG = {
  // From Supabase: Project settings, then API. Leave both empty to run the site in demo mode.
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
   so the site can show each one at its own shape without cropping. */
const ARTWORKS = [
  {
    id: "vestige",
    title: "VESTIGE",
    image: "images/paintings/vestige.jpg", w: 666, h: 891,
    size: "80 × 60 cm",
    year: "2025",
    medium: { da: "Akryl med tørrede blomster og guldfarvede ginkgoblade på lærred", en: "Acrylic with dried flowers and gold ginkgo leaves on canvas" },
    description: {
      da: "Et pigeansigt i klare farver mod en intens blå baggrund. Tørrede blomster og fine, guldfarvede ginkgoblade er presset ind i den teksturerede overflade.",
      en: "A girl’s face in vibrant colour against an intense blue background. Dried flowers and delicate gold ginkgo leaves are pressed into the textured surface."
    }
  },
  {
    id: "florere",
    title: "FLORERE",
    image: "images/paintings/florere.jpg", w: 1300, h: 1752,
    size: "80 × 60 cm",
    year: "2025",
    medium: { da: "Akryl på lærred med ægte tørrede blomster", en: "Acrylic on canvas with real dried flowers" },
    description: {
      da: "Det kan nogle gange være svært at se, når man selv udvikler sig og blomstrer. Men for andre er du blomstret så smukt.",
      en: "Sometimes it can be hard to see when you are growing and blossoming yourself. But to others, you have blossomed so beautifully."
    }
  },
  {
    id: "will-you-catch-me",
    title: "WILL YOU CATCH ME?",
    image: "images/paintings/will-you-catch-me.jpg", w: 1300, h: 1629,
    size: "80 × 60 cm",
    year: "", // leave empty until the year is known; the site then just hides it
    medium: { da: "Akryl på lærred", en: "Acrylic on canvas" },
    // Description of what the painting shows. Laura can replace it with her own story behind the piece.
    description: {
      da: "En kvinde falder ned mod en by i skumringen med armene strakt ud mod beskueren.",
      en: "A woman falls towards a city at dusk, her arms reaching out to the viewer."
    }
  },

  /* Only in the portfolio, not for sale as prints (shop: false).
     Fill in medium, size, year and description when known. Anything left empty is simply hidden. */
  {
    id: "lunar-solitude",
    title: "LUNAR SOLITUDE",
    shop: false,
    image: "images/paintings/lunar-solitude.jpg", w: 1300, h: 1391,
    size: "40 × 40 cm",
    year: "",
    medium: { da: "", en: "" },
    description: { da: "", en: "" }
  },
  {
    id: "marasme",
    title: "MARASME",
    shop: false,
    image: "images/paintings/marasme.jpg", w: 1300, h: 1388,
    size: "40 × 40 cm",
    year: "",
    medium: { da: "", en: "" },
    description: { da: "", en: "" }
  },
  {
    id: "flicker",
    title: "FLICKER",
    shop: false,
    image: "images/paintings/flicker-web.jpg", w: 1300, h: 1397,
    size: "40 × 40 cm",
    year: "",
    medium: { da: "", en: "" },
    description: { da: "", en: "" }
  },
  {
    id: "eurowoman-illy",
    title: "EUROWOMAN × ILLY",
    shop: false,
    image: "images/paintings/eurowoman-illy.jpg", w: 1300, h: 1838,
    size: "",
    year: "",
    medium: { da: "", en: "" },
    description: { da: "", en: "" }
  },
  {
    id: "midt-om-natten",
    title: "MIDT OM NATTEN",
    shop: false,
    image: "images/paintings/midt-om-natten.jpg", w: 437, h: 1300,
    size: "",
    year: "",
    medium: { da: "", en: "" },
    description: { da: "", en: "" }
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
  { title: { da: "Koen i engen", en: "Cow in the Meadow" }, image: "images/paintings/ko.jpg", w: 1300, h: 903,
    medium: { da: "Akvarel på papir", en: "Watercolour on paper" },
    desc: { da: "En nysgerrig ko kigger frem mellem højt græs og vilde blomster.", en: "A curious cow peeking out from tall grass and wild flowers." } }
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
