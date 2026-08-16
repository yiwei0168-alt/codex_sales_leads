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
  { query: "integrador redes empresariales WiFi Puebla sitio oficial", role: "SI", leadType: "channel", language: "es", region: "Puebla" },
  { query: "integrador redes empresariales WiFi Querétaro sitio oficial", role: "SI", leadType: "channel", language: "es", region: "Querétaro" },
  { query: "integrador redes empresariales WiFi Tijuana sitio oficial", role: "SI", leadType: "channel", language: "es", region: "Tijuana" },
  { query: "instalación redes WiFi empresas CDMX sitio oficial", role: "Installer", leadType: "channel", language: "es", region: "Mexico City" },
  { query: "instalación redes WiFi empresas Nuevo León sitio oficial", role: "Installer", leadType: "channel", language: "es", region: "Nuevo León" },
  { query: "instalación redes WiFi empresas Jalisco sitio oficial", role: "Installer", leadType: "channel", language: "es", region: "Jalisco" },
  { query: "instalación redes WiFi empresas Yucatán sitio oficial", role: "Installer", leadType: "channel", language: "es", region: "Yucatán" },
  { query: "instalación cableado estructurado redes León Guanajuato", role: "Installer", leadType: "channel", language: "es", region: "León" },
  { query: "instalación cableado estructurado redes Chihuahua México", role: "Installer", leadType: "channel", language: "es", region: "Chihuahua" },
  { query: "servicios administrados de red MSP México sitio oficial", role: "MSP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "integrador CCTV PoE cableado estructurado México sitio oficial", role: "SI", leadType: "channel", language: "es", region: "Mexico" },
  { query: "integrador seguridad electrónica CCTV redes Monterrey", role: "SI", leadType: "channel", language: "es", region: "Monterrey" },
  { query: "proveedor internet ISP WISP regional México sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "proveedor internet empresarial fibra México sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "WISP internet inalámbrico rural México sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Mexico" },
  { query: "WISP proveedor internet regional Oaxaca sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Oaxaca" },
  { query: "WISP proveedor internet regional Chiapas sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Chiapas" },
  { query: "proveedor internet empresarial Mérida Yucatán sitio oficial", role: "ISP", leadType: "channel", language: "es", region: "Mérida" },
  { query: "grupo hotelero mexicano nuestros hoteles sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["hotel", "resort"] },
  { query: "cadena hoteles México destinos sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["hotel", "resort"] },
  { query: "empresa logística mexicana centros distribución sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["logística", "logistica", "transporte", "almac"] },
  { query: "universidad privada México campus sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["universidad", "campus"] },
  { query: "cadena mexicana tiendas sucursales sitio oficial", role: "Retailer", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["tienda", "sucursal"] },
  { query: "fabricante México plantas producción sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["planta", "manufactura", "producción", "produccion"] },
  { query: "grupo restaurantero mexicano sucursales sitio oficial", role: "Retailer", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["restaurante", "sucursal"] },
  { query: "hospital privado México red hospitales sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["hospital", "clínica", "clinica"] },
  { query: "parque industrial México empresas infraestructura sitio oficial", role: "VAR", leadType: "strategic-customer", language: "es", region: "Mexico", requiredTerms: ["industrial", "parque", "planta"] },
];
