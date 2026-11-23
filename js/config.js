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

  mobilepay: { number: "12 34 56 78", name: "Laura Kruuse" },

  contact: {
    email: "laur723kru@gmail.com",
    instagram: { url: "https://www.instagram.com/laur_kru", handle: "@laur_kru" },
    tiktok: { url: "https://www.tiktok.com/@hassel_art", handle: "@hassel_art" }
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
    image: "images/paintings/vestige.jpg", w: 666, h: 891,
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
      da: "En kvinde falder ned mod en by i skumringen med armene strakt ud mod beskueren. Under hende glimter gadelygter og billygter.",
      en: "A woman falls towards a city at dusk, her arms reaching out to the viewer. Below her, street lights and car headlights glitter."
    }
  }
];

const SKETCHES = [
  { title: { da: "Håndstudie", en: "Hand Study" }, image: "images/paintings/hand_sketch.jpg", w: 613, h: 574,
    medium: { da: "Maling på lærred", en: "Paint on canvas" },
    desc: { da: "Et studie af hænder og perler, med fokus på form, lys og proportioner.", en: "A study of hands and pearls, focusing on form, light and proportion." } },
  { title: { da: "Projekt undervejs", en: "Art Project in Progress" }, image: "images/paintings/sketch.jpg", w: 889, h: 891,
    medium: { da: "Maling på lærred, undervejs", en: "Paint on canvas, in progress" },
    desc: { da: "Et igangværende værk, der undersøger, hvordan man gengiver stoffets tekstur i en gylden kjole.", en: "Work in progress, exploring how to render the texture of fabric in a golden dress." } },
  { title: { da: "Portræt i kul", en: "Portrait in Charcoal" }, image: "images/paintings/sketch1.jpg", w: 236, h: 367,
    medium: { da: "Kul på papir", en: "Charcoal on paper" },
    desc: { da: "Tegning bygget op af skygger, der undersøger dybde og kontrast.", en: "Shadow-based drawing, exploring depth and contrast." } },
  { title: { da: "Billie Eilish-skitse", en: "Billie Eilish Sketch" }, image: "images/paintings/sketch2.jpg", w: 239, h: 360,
    medium: { da: "Grafit på papir", en: "Graphite on paper" },
    desc: { da: "Et detaljeret portrætstudie med omhyggelig skyggelægning og sans for proportioner.", en: "A detailed portrait study with careful shading and attention to proportion." } }
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
