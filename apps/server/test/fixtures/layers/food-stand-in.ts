/**
 * Stand-ins for the food and supplies layer's two sources, for the server tests and the
 * end-to-end suite: an Overpass server's answer and the Food Standards Agency's API.
 *
 * OVERPASS_FOOD_ANSWER is a real answer, unchanged but for the list of node ids each way
 * names (removed: Outpost does not read them), from ovp.dresel.systems on 17 November 2026
 * (map data as of 2026-11-16T21:22:36Z) to the layer's own question for the box
 * 54.5985,-3.1420 to 54.6055,-3.1280 (the middle of Keswick): 12 places, 13,427 bytes as
 * sent. The data is © OpenStreetMap contributors, under the Open Database Licence 1.0
 * (https://www.openstreetmap.org/copyright).
 *
 * FSA_SUPERMARKETS and FSA_OTHER_RETAILERS are real answers from
 * https://api.ratings.food.gov.uk/Establishments on 17 November 2026, for the middle of
 * Keswick (54.6020, -3.1350, 0.3 miles), business types 7840 and 4613. The first is whole
 * (one business); the second keeps 8 of its 21 businesses, chosen for the cases the tests
 * need (a chemist and a shop that are also in OpenStreetMap, a newsagent two metres from a
 * mapped shop of another name, and businesses outside the box), with each one's `links`
 * and the answer's `links` removed and the counts in `meta` set to what is kept. Contains
 * public sector information licensed under the Open Government Licence v3.0 (Food
 * Standards Agency). Their hygiene ratings are in the answers, as the API gives them;
 * Outpost does not keep or show them.
 */
import type http from "node:http";

/** The box the answers are for: west, south, east, north. */
export const KESWICK_BOX: [number, number, number, number] = [-3142 / 1000, 54.5985, -3.128, 54.6055]; // (-3.142 written so, as the linter takes it for pi)

export const OVERPASS_FOOD_ANSWER = {
  version: 0.6,
  generator: "Overpass API 0.7.62.11 87bfad18",
  osm3s: {
    timestamp_osm_base: "2026-11-16T21:22:36Z",
    copyright: "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
  },
  elements: [
    {
      type: "way",
      id: 149712624,
      bounds: {
        minlat: 54.6016558,
        minlon: -3.1422198,
        maxlat: 54.6023774,
        maxlon: -3.1408389,
      },
      geometry: [
        {
          lat: 54.6023774,
          lon: -3.1415859,
        },
        {
          lat: 54.6022728,
          lon: -3.141396,
        },
        {
          lat: 54.602225,
          lon: -3.1413091,
        },
        {
          lat: 54.6022513,
          lon: -3.1412669,
        },
        {
          lat: 54.6022339,
          lon: -3.1412353,
        },
        {
          lat: 54.6020158,
          lon: -3.1408389,
        },
        {
          lat: 54.6018488,
          lon: -3.1411071,
        },
        {
          lat: 54.6018324,
          lon: -3.1410767,
        },
        {
          lat: 54.6016955,
          lon: -3.1413043,
        },
        {
          lat: 54.6017144,
          lon: -3.1413393,
        },
        {
          lat: 54.6016558,
          lon: -3.1414318,
        },
        {
          lat: 54.6017826,
          lon: -3.1416633,
        },
        {
          lat: 54.6017501,
          lon: -3.1417147,
        },
        {
          lat: 54.6018046,
          lon: -3.1418178,
        },
        {
          lat: 54.6018385,
          lon: -3.1417654,
        },
        {
          lat: 54.6019192,
          lon: -3.1419115,
        },
        {
          lat: 54.601887,
          lon: -3.1419624,
        },
        {
          lat: 54.6019145,
          lon: -3.1420133,
        },
        {
          lat: 54.6019393,
          lon: -3.1420592,
        },
        {
          lat: 54.6019766,
          lon: -3.1420007,
        },
        {
          lat: 54.6020802,
          lon: -3.1421876,
        },
        {
          lat: 54.6021037,
          lon: -3.1421472,
        },
        {
          lat: 54.6021451,
          lon: -3.1422198,
        },
        {
          lat: 54.6022369,
          lon: -3.1420691,
        },
        {
          lat: 54.6021779,
          lon: -3.1419605,
        },
        {
          lat: 54.6022196,
          lon: -3.1418891,
        },
        {
          lat: 54.6022046,
          lon: -3.1418624,
        },
        {
          lat: 54.6023774,
          lon: -3.1415859,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "1",
        "addr:postcode": "CA12 5EA",
        "addr:street": "Tithebarn Street",
        brand: "Booths",
        "brand:wikidata": "Q4943949",
        building: "supermarket",
        check_date: "2025-08-03",
        "fhrs:id": "1549702",
        name: "Booths",
        old_name: "The Lakes Foodstore",
        opening_hours: "Mo-Sa 08:00-22:00; Su 09:30-16:00",
        "payment:cash": "yes",
        "payment:credit_cards": "yes",
        "payment:debit_cards": "yes",
        phone: "+44 17687 73518",
        shop: "supermarket",
        website: "https://www.booths.co.uk/store/keswick/",
        wheelchair: "yes",
      },
    },
    {
      type: "way",
      id: 151793283,
      bounds: {
        minlat: 54.6023664,
        minlon: -3.1405941,
        maxlat: 54.6026819,
        maxlon: -3.1399291,
      },
      geometry: [
        {
          lat: 54.6026357,
          lon: -3.140498,
        },
        {
          lat: 54.6025646,
          lon: -3.1405941,
        },
        {
          lat: 54.6024815,
          lon: -3.140413,
        },
        {
          lat: 54.602509,
          lon: -3.1403754,
        },
        {
          lat: 54.6025005,
          lon: -3.1403579,
        },
        {
          lat: 54.6024914,
          lon: -3.140339,
        },
        {
          lat: 54.6024592,
          lon: -3.1403847,
        },
        {
          lat: 54.6023664,
          lon: -3.1402067,
        },
        {
          lat: 54.6024029,
          lon: -3.1401465,
        },
        {
          lat: 54.6026096,
          lon: -3.1399291,
        },
        {
          lat: 54.6026819,
          lon: -3.1401459,
        },
        {
          lat: 54.6025487,
          lon: -3.1402856,
        },
        {
          lat: 54.6026357,
          lon: -3.140498,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "25",
        "addr:postcode": "CA12 5EF",
        "addr:street": "Main Street",
        "brand:wikidata": "Q110620660",
        building: "supermarket",
        check_date: "2025-06-17",
        name: "Lakes & Dales Co-operative",
        old_name: "Penrith Co-operative Society;Keswick Co-operative Society",
        operator: "Scottish Midland Co-operative Society",
        phone: "+44 17687 72108",
        shop: "supermarket",
        "source:addr:postcode": "code-point_open",
        stroller: "yes",
        website: "https://scotmid.coop/store/keswick/",
      },
    },
    {
      type: "way",
      id: 202854513,
      bounds: {
        minlat: 54.6006038,
        minlon: -3.1356703,
        maxlat: 54.6007332,
        maxlon: -3.1354383,
      },
      geometry: [
        {
          lat: 54.6006038,
          lon: -3.1355691,
        },
        {
          lat: 54.6006788,
          lon: -3.1356703,
        },
        {
          lat: 54.6006949,
          lon: -3.1356358,
        },
        {
          lat: 54.6007143,
          lon: -3.1356653,
        },
        {
          lat: 54.6007332,
          lon: -3.1356274,
        },
        {
          lat: 54.6007123,
          lon: -3.1355942,
        },
        {
          lat: 54.6007068,
          lon: -3.1355854,
        },
        {
          lat: 54.6007163,
          lon: -3.1355661,
        },
        {
          lat: 54.6006904,
          lon: -3.1355299,
        },
        {
          lat: 54.6006782,
          lon: -3.1355098,
        },
        {
          lat: 54.6006487,
          lon: -3.1354383,
        },
        {
          lat: 54.6006038,
          lon: -3.1355691,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "11-13",
        "addr:postcode": "CA12 5HH",
        "addr:street": "Station Street",
        amenity: "pharmacy",
        brand: "Cohens Chemist",
        "brand:wikidata": "Q107998495",
        building: "retail",
        check_date: "2025-08-05",
        healthcare: "pharmacy",
        name: "Cohens Chemist",
        old_name: "Murrays",
        opening_hours: "Mo-Fr 09:00-17:00; Sa-Su off",
        phone: "+44 17687 72049",
        website: "https://www.cohenschemist.co.uk/mycohens/directory/?branch=517",
        wheelchair: "yes",
      },
    },
    {
      type: "way",
      id: 336044378,
      bounds: {
        minlat: 54.6005437,
        minlon: -3.1338261,
        maxlat: 54.6006848,
        maxlon: -3.1335517,
      },
      geometry: [
        {
          lat: 54.6005898,
          lon: -3.1335517,
        },
        {
          lat: 54.6006143,
          lon: -3.1335675,
        },
        {
          lat: 54.6006848,
          lon: -3.133613,
        },
        {
          lat: 54.6006387,
          lon: -3.1338261,
        },
        {
          lat: 54.600597,
          lon: -3.1337992,
        },
        {
          lat: 54.6005437,
          lon: -3.1337648,
        },
        {
          lat: 54.6005898,
          lon: -3.1335517,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:postcode": "CA12 4HN",
        "addr:street": "Shorley Lane",
        brand: "Go Local",
        "brand:wikidata": "Q120634011",
        building: "yes",
        name: "Go Local",
        opening_hours: "Mo-Su 07:00-22:00",
        phone: "+44 17687 74870",
        "ref:GB:uprn": "100110729672;100110683123;100110683125",
        shop: "convenience",
      },
    },
    {
      type: "way",
      id: 427890617,
      bounds: {
        minlat: 54.6002355,
        minlon: -3.1366493,
        maxlat: 54.6002895,
        maxlon: -3.1365596,
      },
      geometry: [
        {
          lat: 54.6002895,
          lon: -3.1365906,
        },
        {
          lat: 54.6002623,
          lon: -3.1365596,
        },
        {
          lat: 54.6002355,
          lon: -3.1366271,
        },
        {
          lat: 54.6002556,
          lon: -3.1366493,
        },
        {
          lat: 54.6002895,
          lon: -3.1365906,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "3",
        "addr:postcode": "CA12 5BS",
        "addr:street": "Lake Road",
        building: "retail",
        check_date: "2025-06-17",
        "fhrs:id": "1549554",
        name: "Cornish Pasty",
        "ref:GB:uprn": "100110729837",
        shop: "bakery",
      },
    },
    {
      type: "way",
      id: 428092954,
      bounds: {
        minlat: 54.599899,
        minlon: -3.1355226,
        maxlat: 54.6001,
        maxlon: -3.1353052,
      },
      geometry: [
        {
          lat: 54.599899,
          lon: -3.1354155,
        },
        {
          lat: 54.6000683,
          lon: -3.1353052,
        },
        {
          lat: 54.6001,
          lon: -3.135396,
        },
        {
          lat: 54.6000561,
          lon: -3.1354312,
        },
        {
          lat: 54.5999361,
          lon: -3.1355226,
        },
        {
          lat: 54.599899,
          lon: -3.1354155,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "5",
        "addr:postcode": "CA12 5AP",
        "addr:street": "Saint John's Street",
        brand: "Premier",
        "brand:wikidata": "Q7240340",
        building: "retail",
        check_date: "2025-06-17",
        "fhrs:id": "1550097",
        name: "Open All Hours",
        shop: "convenience",
        wheelchair: "no",
      },
    },
    {
      type: "way",
      id: 428652562,
      bounds: {
        minlat: 54.6009196,
        minlon: -3.1381069,
        maxlat: 54.6010548,
        maxlon: -3.1378725,
      },
      geometry: [
        {
          lat: 54.6009882,
          lon: -3.1381069,
        },
        {
          lat: 54.6009635,
          lon: -3.1380695,
        },
        {
          lat: 54.6009196,
          lon: -3.1380028,
        },
        {
          lat: 54.600989,
          lon: -3.1378725,
        },
        {
          lat: 54.6010548,
          lon: -3.1379773,
        },
        {
          lat: 54.6010395,
          lon: -3.138007,
        },
        {
          lat: 54.6009882,
          lon: -3.1381069,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "31",
        "addr:postcode": "CA12 5BL",
        "addr:street": "Main Street",
        amenity: "pharmacy",
        brand: "Boots",
        "brand:wikidata": "Q6123139",
        building: "retail",
        check_date: "2025-08-05",
        "fhrs:id": "1549668",
        healthcare: "pharmacy",
        name: "Boots",
        opening_hours: "Mo-Fr 09:00-18:00; Sa 09:00-17:00; Su 10:00-17:00",
        "payment:cash": "yes",
        "payment:credit_cards": "yes",
        "payment:debit_cards": "yes",
        phone: "+44 17687 72383",
        "ref:GB:uprn": "100110730051",
        website: "https://www.boots.com/stores/1167-keswick-main-street-ca12-5bl",
        wheelchair: "yes",
      },
    },
    {
      type: "way",
      id: 428652567,
      bounds: {
        minlat: 54.6010274,
        minlon: -3.1382644,
        maxlat: 54.6011431,
        maxlon: -3.1380563,
      },
      geometry: [
        {
          lat: 54.6010274,
          lon: -3.138201,
        },
        {
          lat: 54.6010885,
          lon: -3.138082,
        },
        {
          lat: 54.6011017,
          lon: -3.1380563,
        },
        {
          lat: 54.6011431,
          lon: -3.1381197,
        },
        {
          lat: 54.6010689,
          lon: -3.1382644,
        },
        {
          lat: 54.6010274,
          lon: -3.138201,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "35",
        "addr:postcode": "CA12 5BL",
        "addr:street": "Main Street",
        building: "retail",
        check_date: "2025-06-17",
        "contact:facebook": "keswickminimarket",
        "fhrs:id": "268115",
        name: "Keswick Mini Market",
        opening_hours: 'Mo-Su 08:00+ closed "8 til late"',
        "ref:GB:uprn": "10096617546;100110730099",
        shop: "convenience",
      },
    },
    {
      type: "way",
      id: 1419442049,
      bounds: {
        minlat: 54.6005272,
        minlon: -3.1366656,
        maxlat: 54.6006831,
        maxlon: -3.1363486,
      },
      geometry: [
        {
          lat: 54.6005691,
          lon: -3.1366656,
        },
        {
          lat: 54.6005272,
          lon: -3.1365938,
        },
        {
          lat: 54.6005838,
          lon: -3.1364748,
        },
        {
          lat: 54.6006438,
          lon: -3.1363486,
        },
        {
          lat: 54.6006831,
          lon: -3.1364017,
        },
        {
          lat: 54.6006409,
          lon: -3.1364878,
        },
        {
          lat: 54.6006562,
          lon: -3.1365094,
        },
        {
          lat: 54.6005691,
          lon: -3.1366656,
        },
      ],
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "2",
        "addr:postcode": "CA12 5HZ",
        "addr:street": "Main Street",
        brand: "Cornish Bakery",
        "brand:wikidata": "Q124030035",
        building: "yes",
        check_date: "2025-06-17",
        "fhrs:id": "1550525",
        name: "Cornish Bakery",
        note: "FHRS data has 5JD",
        "ref:GB:uprn": "100110730048;100110798855",
        shop: "bakery",
        website: "https://thecornishbakery.com/pages/locations",
      },
    },
    {
      type: "node",
      id: 1815349448,
      lat: 54.601464,
      lon: -3.1381186,
      tags: {
        "addr:city": "Keswick",
        "addr:housenumber": "38-42",
        "addr:postcode": "CA12 5JD",
        "addr:street": "Main Street",
        check_date: "2025-06-17",
        "check_date:opening_hours": "2024-10-04",
        "fhrs:id": "1549669",
        name: "Bryson's Bakery",
        "opening_hours:signed": "no",
        "payment:credit_cards": "yes",
        "payment:debit_cards": "yes",
        phone: "+44 17687 72257",
        shop: "bakery",
        website: "https://brysonsofkeswick.co.uk/",
        wheelchair: "yes",
      },
    },
    {
      type: "node",
      id: 13955388339,
      lat: 54.6001571,
      lon: -3.1314654,
      tags: {
        "addr:city": "Keswick",
        "addr:postcode": "CA12 4EN",
        "addr:street": "Helvellyn Street",
        "fhrs:id": "1762518",
        level: "0",
        name: "Helvellyn Street Bakery",
        shop: "bakery",
      },
    },
    {
      type: "node",
      id: 14133600332,
      lat: 54.6007543,
      lon: -3.1371598,
      tags: {
        amenity: "drinking_water",
        fountain: "bubbler",
        indoor: "no",
        note: "On the wall outside the Moot Hall",
      },
    },
  ],
};

export const FSA_SUPERMARKETS = {
  establishments: [
    {
      AddressLine1: "1 TITHEBARN STREET",
      AddressLine2: "",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Booths Supermarket & Cafe 1847",
      BusinessType: "Retailers - supermarkets/hypermarkets",
      BusinessTypeID: 7840,
      ChangesByServerID: 0,
      Distance: 0.214539468551177,
      FHRSID: 1549702,
      LocalAuthorityBusinessID: "FH000532",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5ED",
      RatingDate: "2026-06-03T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1403594",
        latitude: "54.6019397",
      },
      scores: {
        Hygiene: 0,
        Structural: 5,
        ConfidenceInManagement: 0,
      },
    },
  ],
  meta: {
    dataSource: "ElasticSearch",
    extractDate: "2026-11-17T14:11:22.7928347+00:00",
    itemCount: 1,
    returncode: "OK",
    totalCount: 1,
    totalPages: 1,
    pageSize: 5000,
    pageNumber: 1,
  },
};

export const FSA_OTHER_RETAILERS = {
  establishments: [
    {
      AddressLine1: "SCOTGATE HOLIDAY PARK",
      AddressLine2: "BRAITHWAITE",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Braithwaite Village Camping and  Caravanning Club Site",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 2.1229113721376995,
      FHRSID: 1663296,
      LocalAuthorityBusinessID: "FH002757",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5TF",
      RatingDate: "2023-11-29T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1880428",
        latitude: "54.6020652",
      },
      scores: {
        Hygiene: 0,
        Structural: 0,
        ConfidenceInManagement: 0,
      },
    },
    {
      AddressLine1: "8 MUSEUM SQUARE",
      AddressLine2: "",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Grape Tree",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 0.16929779807400427,
      FHRSID: 1549485,
      LocalAuthorityBusinessID: "FH000089",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5DZ",
      RatingDate: "2021-04-12T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1391601",
        latitude: "54.6015575",
      },
      scores: {
        Hygiene: 0,
        Structural: 0,
        ConfidenceInManagement: 0,
      },
    },
    {
      AddressLine1: "8-10 STATION STREET",
      AddressLine2: "",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Greggs PLC (Keswick)",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 0.11268399739688946,
      FHRSID: 1630422,
      LocalAuthorityBusinessID: "FH002733",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5HP",
      RatingDate: "2025-11-14T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1356884",
        latitude: "54.6004198",
      },
      scores: {
        Hygiene: 0,
        Structural: 0,
        ConfidenceInManagement: 0,
      },
    },
    {
      AddressLine1: "35 MAIN STREET",
      AddressLine2: "",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Harpers Newsagents",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 0.14216397354318175,
      FHRSID: 1550167,
      LocalAuthorityBusinessID: "FH001594",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5BL",
      RatingDate: "2020-03-03T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1381679",
        latitude: "54.6010705",
      },
      scores: {
        Hygiene: 5,
        Structural: 0,
        ConfidenceInManagement: 0,
      },
    },
    {
      AddressLine1: "OPEN ALL HOURS",
      AddressLine2: "5 ST JOHNS STREET",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Open All Hours",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 0.13818207011850872,
      FHRSID: 1550097,
      LocalAuthorityBusinessID: "FH001433",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5AP",
      RatingDate: "2024-01-18T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1355381",
        latitude: "54.6000257",
      },
      scores: {
        Hygiene: 0,
        Structural: 0,
        ConfidenceInManagement: 5,
      },
    },
    {
      AddressLine1: "HIGH HILL GARAGE",
      AddressLine2: "HIGH HILL",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Spar (High Hill Garage)",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 0.3847550677769946,
      FHRSID: 1549530,
      LocalAuthorityBusinessID: "FH000198",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5NY",
      RatingDate: "2019-12-06T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.143918",
        latitude: "54.604081",
      },
      scores: {
        Hygiene: 0,
        Structural: 5,
        ConfidenceInManagement: 0,
      },
    },
    {
      AddressLine1: "9 PACK HORSE COURT",
      AddressLine2: "",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "The Cheese Delicatessen Keswick Ltd",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 0.1050842014380023,
      FHRSID: 1550158,
      LocalAuthorityBusinessID: "FH001564",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5JB",
      RatingDate: "2026-01-23T00:00:00",
      RatingKey: "fhrs_5_en-gb",
      RatingValue: "5",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1366437",
        latitude: "54.6008152",
      },
      scores: {
        Hygiene: 0,
        Structural: 0,
        ConfidenceInManagement: 0,
      },
    },
    {
      AddressLine1: "31 MAIN STREET",
      AddressLine2: "",
      AddressLine3: "",
      AddressLine4: "KESWICK",
      BusinessName: "Boots UK Ltd (Keswick)",
      BusinessType: "Retailers - other",
      BusinessTypeID: 4613,
      ChangesByServerID: 0,
      Distance: 0.1401696910754625,
      FHRSID: 1549668,
      LocalAuthorityBusinessID: "FH000452",
      LocalAuthorityCode: "055",
      LocalAuthorityEmailAddress: "environmentalhealth@cumberland.gov.uk",
      LocalAuthorityName: "Cumberland",
      LocalAuthorityWebSite: "http://www.cumberland.gov.uk",
      NewRatingPending: false,
      Phone: "",
      PostCode: "CA12 5BL",
      RatingDate: "1901-01-01T00:00:00",
      RatingKey: "fhrs_exempt_en-gb",
      RatingValue: "Exempt",
      RightToReply: "",
      SchemeType: "FHRS",
      geocode: {
        longitude: "-3.1380101",
        latitude: "54.6009642",
      },
      scores: {
        Hygiene: null,
        Structural: null,
        ConfidenceInManagement: null,
      },
    },
  ],
  meta: {
    dataSource: "ElasticSearch",
    extractDate: "2026-11-17T14:11:24.868702+00:00",
    itemCount: 8,
    returncode: "OK",
    totalCount: 8,
    totalPages: 1,
    pageSize: 5000,
    pageNumber: 1,
  },
};

/** What an Overpass server answers the layer's question with: a count while estimating, the places when downloading. */
export function overpassFoodAnswer(query: string): unknown {
  if (!query.includes("out count")) return OVERPASS_FOOD_ANSWER;
  const count = { type: "count", id: 0, tags: { nodes: "3", ways: "9", relations: "0", total: "12" } };
  return {
    elements: query
      .split("out count")
      .slice(1)
      .map(() => count),
  };
}

/** What the Agency's API answers, by business type; a page of one gives the count. Requests are kept for the tests to read. */
export function createFsaStandIn() {
  const requests: Array<{ url: string; headers: http.IncomingHttpHeaders }> = [];
  return {
    requests,
    handle(request: http.IncomingMessage, response: http.ServerResponse) {
      requests.push({ url: request.url ?? "", headers: request.headers });
      const url = new URL(request.url ?? "/", "http://stand-in");
      if (!url.pathname.endsWith("/Establishments")) {
        response.writeHead(404).end();
        return;
      }
      if (request.headers["x-api-version"] !== "2") {
        // As the Agency says: without the version "calls to FHRS API endpoints will not return data".
        response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ message: "No version" }));
        return;
      }
      const type = url.searchParams.get("businessTypeId");
      const answer = type === "7840" ? FSA_SUPERMARKETS : type === "4613" ? FSA_OTHER_RETAILERS : null;
      if (!answer) {
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ establishments: [], meta: { totalCount: 0 } }));
        return;
      }
      const size = Number(url.searchParams.get("pageSize") ?? 5000);
      const page = {
        ...answer,
        establishments: answer.establishments.slice(0, size),
        meta: { ...answer.meta, itemCount: Math.min(size, answer.establishments.length), pageSize: size },
      };
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(page));
    },
  };
}
