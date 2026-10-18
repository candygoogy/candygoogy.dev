// The /uses page: what candygoogy uses. No hostnames, addresses, ports or
// versions, ever: only the products.

// A line under a row's product, led by a small soft tag ("NVMe: …").
export interface UseDetail {
  tag: string;
  text: string;
}

export interface UseRow {
  label: string;
  // One product per line, or a tagged detail line under the one before.
  items: (string | UseDetail)[];
}

// The homelab is a tree: each device under the one it's connected to,
// drawn as wires down the left (HomelabTree.astro).
export interface NetRow {
  id: string;
  label: string;
  product: string;
  // The device it's connected to (its id); none for the Internet.
  parent?: string;
  // A cable unless said: a cable that also powers it (PoE), or Wi-Fi.
  link?: "cable" | "poe" | "wifi";
  // Where the product has its own section.
  href?: string;
  // A line under the product: soft, or led by a soft tag (shown as
  // written) with the rest in ink.
  detail?: { tag?: string; text: string; href?: string };
  // Not one device: whatever else is on the Wi-Fi, coming and going.
  crowd?: boolean;
}

export type UseSection =
  | { id: string; title: string; rows: UseRow[] }
  | { id: string; title: string; net: NetRow[] };

export const uses = {
  title: "What I use",
  lede: "The network I run at home, and the machines I work on.",
  sections: [
    {
      id: "homelab",
      title: "Homelab",
      // In the order they're drawn: each device's own devices follow it.
      net: [
        { id: "internet", label: "Internet", product: "5G" },
        {
          id: "router",
          label: "Router",
          product: "MikroTik Chateau 5G R17 ax",
          parent: "internet",
        },
        {
          id: "ap",
          label: "Access point",
          product: "TP-Link Omada EAP610",
          parent: "router",
          link: "poe",
          detail: { text: "Wi-Fi 6" },
        },
        {
          id: "laptop",
          label: "Laptop",
          product: "ASUS Zenbook 14",
          parent: "ap",
          link: "wifi",
          href: "#laptop",
        },
        {
          id: "crowd",
          label: "Everything else",
          product: "Whatever asks for the password",
          parent: "ap",
          link: "wifi",
          crowd: true,
        },
        {
          id: "switch",
          label: "Switch",
          product: "Netgear ProSAFE GS108",
          parent: "router",
        },
        {
          id: "server",
          label: "Server",
          product: "Lenovo V15",
          parent: "switch",
          detail: {
            tag: "Runs",
            text: "candygoogy-bot",
            href: "/projects#candygoogy-bot",
          },
        },
        {
          id: "desktop",
          label: "Desktop",
          product: "Ryzen 7 9800X3D, RX 6900 XT",
          parent: "router",
          href: "#desktop",
        },
      ],
    },
    {
      id: "desktop",
      title: "Desktop",
      rows: [
        { label: "Case", items: ["ASUS ProArt PA602 Wood Edition"] },
        { label: "Motherboard", items: ["Gigabyte X870E AORUS MASTER X3D"] },
        { label: "CPU", items: ["AMD Ryzen 7 9800X3D"] },
        { label: "Cooler", items: ["Noctua LC-1-42 + NL-ACF1"] },
        {
          label: "Fans",
          items: ["Noctua NF-A14x25 G2", "Noctua NF-A20 Series"],
        },
        { label: "GPU", items: ["AMD Radeon RX 6900 XT"] },
        {
          label: "Memory",
          items: ["32GB (2x16GB) G.Skill Flare X5 @ 6000MHz CL28"],
        },
        // Compacted: the total, then the drives by interface.
        {
          label: "Storage",
          items: [
            "5TB across five 1TB drives",
            {
              tag: "NVMe",
              text: "Samsung 9100 Pro, Crucial T500, WD SN720",
            },
            { tag: "SATA", text: "Samsung 860 EVO, Crucial MX500" },
          ],
        },
        {
          label: "Power supply",
          items: ["Seasonic PRIME TX-1600 Noctua Edition"],
        },
        { label: "OS", items: ["Windows 11 Enterprise"] },
      ],
    },
    {
      id: "laptop",
      title: "Laptop",
      rows: [
        { label: "Model", items: ["ASUS Zenbook 14"] },
        { label: "CPU", items: ["Intel Core Ultra 7 255H"] },
        { label: "Memory", items: ["32GB @ 7467MHz"] },
        { label: "GPU", items: ["Intel Arc 140T"] },
        { label: "OS", items: ["Windows 11 Enterprise"] },
      ],
    },
    {
      id: "peripherals",
      title: "Peripherals",
      rows: [
        {
          label: "Displays",
          items: ["Samsung Odyssey OLED G8 (G80SH)", "Lenovo Legion Y27q-20"],
        },
        {
          label: "Audio",
          items: [
            "Fosi Audio ZH3 DAC/Amp",
            "Beyerdynamic DT 900 Pro X",
            "Simgot EW300",
          ],
        },
        {
          label: "Mic and camera",
          items: ["Rode NT-USB", "Logitech Brio 4K UHD"],
        },
        {
          label: "Keyboards",
          items: [
            "Wooting 80HE Zinc Alloy",
            "Realforce R2 PFU Ltd",
            "Logitech MX Keys Mini",
          ],
        },
        {
          label: "Mice",
          items: [
            "Zowie ZA13-DW",
            "Logitech MX Master 4",
            "Logitech MX Anywhere 3S",
          ],
        },
        {
          label: "Mouse pads",
          items: ["Noctua XXL Pad", "Razer Strider XXL"],
        },
        {
          label: "Controllers",
          items: ["Steam Controller", "GameSir G7 HE"],
        },
      ],
    },
  ] satisfies UseSection[],
};
