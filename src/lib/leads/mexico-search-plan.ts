import type { ChannelRole } from "@/lib/domain";

export interface MexicoSearchQuery {
  query: string;
  role: ChannelRole;
  leadType: "channel" | "strategic-customer";
  language: "es" | "en";
  region: string;
  requiredTerms?: string[];
}

export const mexicoSearchPlan: MexicoSearchQuery[] = [
  { query: "sitio oficial distribuidor mayorista equipos de redes México", role: "Distributor", leadType: "channel", language: "es", region: "Mexico" },
  { query: "sitio oficial mayorista WiFi routers switches México", role: "Distributor", leadType: "channel", language: "es", region: "Mexico" },
  { query: "distribuidor redes telecomunicaciones Ciudad de México sitio oficial", role: "VAD", leadType: "channel", language: "es", region: "Mexico City" },
  { query: "distribuidor redes telecomunicaciones Monterrey sitio oficial", role: "VAD", leadType: "channel", language: "es", region: "Monterrey" },
  { query: "distribuidor redes telecomunicaciones Guadalajara sitio oficial", role: "VAD", leadType: "channel", language: "es", region: "Guadalajara" },
  { query: "tienda mexicana equipos de red routers switches access point", role: "Retailer", leadType: "channel", language: "es", region: "Mexico" },
  { query: "revendedor VAR soluciones networking empresas México sitio oficial", role: "VAR", leadType: "channel", language: "es", region: "Mexico" },
  { query: "integrador redes empresariales WiFi LAN México sitio oficial", role: "SI", leadType: "channel", language: "es", region: "Mexico" },
  { query: "integrador redes empresariales WiFi Monterrey", role: "SI", leadType: "channel", language: "es", region: "Monterrey" },
  { query: "integrador redes empresariales WiFi Guadalajara", role: "SI", leadType: "channel", language: "es", region: "Guadalajara" },
  { query: "instalación redes WiFi empresas CDMX sitio oficial", role: "Installer", leadType: "channel", language: "es", region: "Mexico City" },
  { query: "instalación redes WiFi empresas Nuevo León sitio oficial", role: "Installer", leadType: "channel", language: "es", region: "Nuevo León" },
  { query: "instalación redes WiFi empresas Jalisco sitio oficial", role: "Installer", leadType: "channel", language: "es", region: "Jalisco" },
  { query: "servicios administrados de red MSP México sitio oficial", role: "MSP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "integrador CCTV PoE cableado estructurado México sitio oficial", role: "SI", leadType: "channel", language: "es", region: "Mexico" },
  { query: "integrador seguridad electrónica CCTV redes Monterrey", role: "SI", leadType: "channel", language: "es", region: "Monterrey" },
  { query: "proveedor internet ISP WISP regional México sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "proveedor internet empresarial fibra México sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "WISP internet inalámbrico rural México sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "grupo hotelero mexicano nuestros hoteles sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["hotel", "resort"] },
  { query: "cadena hoteles México destinos sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["hotel", "resort"] },
  { query: "empresa logística mexicana centros distribución sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["logística", "logistica", "transporte", "almac"] },
  { query: "universidad privada México campus sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["universidad", "campus"] },
  { query: "cadena mexicana tiendas sucursales sitio oficial", role: "Retailer", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["tienda", "sucursal"] },
  { query: "fabricante México plantas producción sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["planta", "manufactura", "producción", "produccion"] },
];
