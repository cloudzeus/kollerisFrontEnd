import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { ZONES } from "@/lib/shipping/acs-tariff";
import { DEFAULT_VAT_RATE, formatMoney } from "@/lib/format";
import { searchKey } from "@/lib/greek";
import type { FaqEntry, FaqSection } from "@/lib/faq/faq-types";

/**
 * The FAQ.
 *
 * Every number in an answer is INTERPOLATED from the constant the rest of the
 * site uses — the free-shipping threshold from `cart/options` and
 * the delivery windows from the ACS tariff engine, the catalogue size from the
 * database. A FAQ is the first thing to go stale in a shop, and it goes stale
 * silently: nobody re-reads it when the threshold moves from 150 to 200, and
 * then it is quietly lying to customers.
 *
 * Content is hardcoded here rather than in a model on purpose. There are
 * twenty-odd answers, they change a few times a year, and a `Faq` model with an
 * admin screen is Phase 3 work — this file is the seam it will replace.
 */

export const getFaq = cache(async (locale: Locale): Promise<FaqSection[]> => {
  const [products, inStock, brands] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, inStock: true } }),
    prisma.product.findMany({
      where: { isActive: true, mtrmark: { not: null } },
      distinct: ["mtrmark"],
      select: { mtrmark: true },
    }),
  ]);

  const n = (value: number) => value.toLocaleString(locale);
  const eta = (id: keyof typeof ZONES) => ZONES[id].etaDays;

  const t = await getTranslations({ locale, namespace: "faq" });

  const sections: Array<Omit<FaqSection, "entries"> & { entries: Array<Omit<FaqEntry, "key">> }> = [
    {
      id: "paraggelia",
      title: t("enotita_paraggelia"),
      entries: [
        {
          q: t("erotisi_chreiazetai_logariasmos_gia_na_paraggeilo"),
          a: t("apantisi_ochi_mporeite_na_oloklirosete_tin_paraggelia"),
        },
        {
          q: t("erotisi_mporo_na_paraggeilo_me_tilefono"),
          a: t("apantisi_nai_sto_210_411_1355_deytera"),
        },
        {
          q: t("erotisi_pos_xero_oti_yparchei_pragmatika"),
          a: t("apantisi_i_diathesimotita_sto_site_einai_to", { inStock: n(inStock), products: n(products) }),
        },
        {
          q: t("erotisi_den_vrisko_ton_kodiko_poy"),
          a: t("apantisi_i_anazitisi_dechetai_kodiko_kolleris_kodiko", { products: n(products), brandslength: brands.length }),
        },
      ],
    },
    {
      id: "apostoli",
      title: t("enotita_apostoli"),
      entries: [
        {
          q: t("erotisi_poso_kostizei_i_apostoli"),
          a: t("apantisi_ypologizetai_apo_to_chreosimo_varos_kai", { formatMoneyFREE_SHIPPING_THRESHOLD_NET: formatMoney(FREE_SHIPPING_THRESHOLD_NET, locale) }),
        },
        {
          q: t("erotisi_pote_tha_ftasei"),
          a: t("apantisi_paraggelia_prin_tis_15_00_ergasimi", { etaAttica: eta("attica"), etaMainland: eta("mainland"), etaIsland: eta("island"), etaRemote: eta("remote") }),
        },
        {
          q: t("erotisi_mporo_na_paralavo_apo_to"),
          a: t("apantisi_nai_apo_ton_peiraia_k_mayromichali"),
        },
        {
          q: t("erotisi_pos_parakoloytho_tin_paraggelia_moy"),
          a: t("apantisi_me_ton_arithmo_paraggelias_kai_to"),
        },
      ],
    },
    {
      id: "times",
      title: t("enotita_times_kai_pliromi"),
      entries: [
        {
          q: t("erotisi_oi_times_einai_me_fpa"),
          a: t("apantisi_nai_oles_kathe_timi_sto_site", { DEFAULT_VAT_RATE }),
        },
        {
          q: t("erotisi_pos_mporo_na_pliroso"),
          a: t("apantisi_karta_kai_iris_meso_viva_wallet"),
        },
        {
          q: t("erotisi_echete_timi_gia_epaggelmaties"),
          a: t("apantisi_nai_o_etairikos_logariasmos_dinei_monimi"),
        },
        {
          q: t("erotisi_giati_den_vlepo_ekptoseis"),
          a: t("apantisi_giati_den_trechei_prosfora_tha_mporoysame"),
        },
        {
          q: t("erotisi_ekdidete_timologio"),
          a: t("apantisi_nai_sto_tameio_epilexte_thelo_timologio"),
        },
      ],
    },
    {
      id: "eggyisi",
      title: t("enotita_eggyisi_kai_epistrofes"),
      entries: [
        {
          q: t("erotisi_ti_eggyisi_echoyn_ta_ergaleia"),
          a: t("apantisi_episimi_eggyisi_kataskeyasti_i_diarkeia_diaferei"),
        },
        {
          q: t("erotisi_mporo_na_epistrepso_kati"),
          a: t("apantisi_entos_14_imeron_ametacheiristo_sti_syskeyasia"),
        },
        {
          q: t("erotisi_irthe_lathos_i_elattomatiko_ti"),
          a: t("apantisi_tilefoniste_tin_idia_mera_sto_210"),
        },
      ],
    },
    {
      id: "logariasmos",
      title: t("enotita_logariasmos"),
      entries: [
        {
          q: t("erotisi_poia_i_diafora_idioti_kai"),
          a: t("apantisi_o_idiotis_echei_paraggelies_dieythynseis_eggyiseis"),
        },
        {
          q: t("erotisi_poso_kanei_na_egkrithei_o"),
          a: t("apantisi_synithos_2_ergasimes_elegchoyme_afm_drastiriotita"),
        },
        {
          q: t("erotisi_mporoyn_polloi_ypalliloi_na_paraggelnoyn"),
          a: t("apantisi_nai_o_diacheiristis_tis_etaireias_proskalei"),
        },
      ],
    },
  ];

  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => ({
      ...entry,
      // Normalised once here so the client filter is a plain `includes`.
      key: searchKey(`${entry.q} ${entry.a}`),
    })),
  }));
});
