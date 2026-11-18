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

  mobilepay: { number: "12 34 56 78", name: "Laura Kruuse" },

  contact: {
    email: "hello@laurakruuse.dk",
    instagram: { url: "https://www.instagram.com/laur_kru", handle: "@laur_kru" },
    tiktok: { url: "https://www.tiktok.com/@hassel_art", handle: "@hassel_art" },
    messenger: { url: "https://m.me/YOUR_FACEBOOK_USERNAME" }
  },

  // Prices in DKK. Keep "ship" the same as in supabase-setup.sql.
  shipping: { ship: 59, pickup: 0 },
  reserveHours: 48,
  pickupText: { da: "Hent selv, vi aftaler et tidspunkt", en: "Pick up in person, we agree on a time" },
  giftNote: { da: "Alle printordrer får en lille overraskelse med fra atelieret.", en: "Every print order comes with a small surprise from the studio." }
};

/* Pictures: put them in the images folder. w and h are the picture's size in pixels,
   so the site can show each one at its own shape without cropping. */
const ARTWORKS = [
  {
    id: "vestige",
    title: "VESTIGE",
    image: "images/vestige.jpg", w: 666, h: 891,
    size: "80 × 60 cm",
    year: "2025",
    medium: { da: "Akryl med tørrede blomster og guldfarvede ginkgoblade på lærred", en: "Acrylic with dried flowers and gold ginkgo leaves on canvas" },
    description: {
      da: "Et pigeansigt i klare farver mod en intens blå baggrund. Tørrede blomster og fine, guldfarvede ginkgoblade er presset ind i den teksturerede overflade og giver hele værket en lysende kvalitet.",
      en: "A girl’s face in vibrant colour against an intense blue background. Dried flowers and delicate gold ginkgo leaves are pressed into the textured surface, adding a luminous quality to the whole piece."
    }
  },
  {
    id: "florere",
    title: "FLORERE",
    image: "images/florere.jpg", w: 1300, h: 1752,
    size: "80 × 60 cm",
    year: "2025",
    medium: { da: "Akryl med ægte tørrede blomster på lærred", en: "Acrylic with real dried flowers on canvas" },
    description: {
      da: "Det kan nogle gange være svært at se, når man selv udvikler sig og blomstrer. Men for andre er du blomstret så smukt.",
      en: "Sometimes it can be hard to see when you are growing and blossoming yourself. But to others, you have blossomed so beautifully."
    }
  },
  {
    id: "falling",
    title: "FALLING",
    image: "images/falling.jpg", w: 1300, h: 1629,
    // PLACEHOLDER: replace size, year, medium and description with Laura's own details
    size: "XX × XX cm",
    year: "XXXX",
    medium: { da: "Lorem ipsum dolor sit amet", en: "Lorem ipsum dolor sit amet" },
    description: {
      da: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      en: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
    }
  }
];

const SKETCHES = [
  { title: { da: "Håndstudie", en: "Hand Study" }, image: "images/hand_sketch.jpg", w: 613, h: 574,
    medium: { da: "Maling på lærred", en: "Paint on canvas" },
    desc: { da: "Et studie af hænder og perler, med fokus på form, lys og proportioner.", en: "A study of hands and pearls, focusing on form, light and proportion." } },
  { title: { da: "Projekt undervejs", en: "Art Project in Progress" }, image: "images/sketch.jpg", w: 889, h: 891,
    medium: { da: "Maling på lærred, undervejs", en: "Paint on canvas, in progress" },
    desc: { da: "Et igangværende værk, der undersøger, hvordan man gengiver stoffets tekstur i en gylden kjole.", en: "Work in progress, exploring how to render the texture of fabric in a golden dress." } },
  { title: { da: "Portræt i kul", en: "Portrait in Charcoal" }, image: "images/sketch1.jpg", w: 236, h: 367,
    medium: { da: "Kul på papir", en: "Charcoal on paper" },
    desc: { da: "Tegning bygget op af skygger, der undersøger dybde og kontrast.", en: "Shadow-based drawing, exploring depth and contrast." } },
  { title: { da: "Billie Eilish-skitse", en: "Billie Eilish Sketch" }, image: "images/sketch2.jpg", w: 239, h: 360,
    medium: { da: "Grafit på papir", en: "Graphite on paper" },
    desc: { da: "Et detaljeret portrætstudie med omhyggelig skyggelægning og sans for proportioner.", en: "A detailed portrait study with careful shading and attention to proportion." } }
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
    text: { da: "Der står nye malerier på staffeliet. Bliv den første, der hører, når det næste kommer på auktion.", en: "New paintings are on the easel. Be the first to know when the next one goes up for auction." } }
];
