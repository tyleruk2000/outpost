/**
 * Test-only: a small real sample of Ordnance Survey's OS Open Names, October 2026 edition
 * (product version "2026-10", file opname_csv_gb.zip, MD5 bba5aa44ba375d39de60584099e335cd),
 * and a zip and a stand-in for OS's Downloads API made from it.
 *
 * Contains OS data © Crown copyright and database right 2026. OS OpenData, reused under the
 * Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/),
 * which allows copying, publishing and adapting it on condition that this statement is kept.
 *
 * How it was made, so it can be made again: the CSV download was fetched once from
 * https://api.os.uk/downloads/v1/products/OpenNames/downloads?area=GB&format=CSV&redirect
 * on 17 November 2026, and these 44 records were copied from its Data/*.csv files unchanged
 * (the byte-order mark at the start of each file dropped): settlements, hills, water, roads
 * and postcodes around Aberystwyth, Ambleside and Grasmere, five places called Newport,
 * roads named after Ambleside, Grasmere and Scafell Pike elsewhere, Ben Nevis, one record
 * whose local type is quoted because it holds commas, one "Section Of Named Road" (which
 * Outpost leaves out), and postcodes in SY23, LA22 and PO30.
 */
import { createHash } from "node:crypto";
import http from "node:http";
import { buildZip } from "./zip.ts";

/** The header file OS ships as Doc/OS_Open_Names_Header.csv (it starts with a byte-order mark). */
export const OS_NAMES_HEADER_FILE =
  "\uFEFFID,NAMES_URI,NAME1,NAME1_LANG,NAME2,NAME2_LANG,TYPE,LOCAL_TYPE,GEOMETRY_X,GEOMETRY_Y,MOST_DETAIL_VIEW_RES,LEAST_DETAIL_VIEW_RES,MBR_XMIN,MBR_YMIN,MBR_XMAX,MBR_YMAX,POSTCODE_DISTRICT,POSTCODE_DISTRICT_URI,POPULATED_PLACE,POPULATED_PLACE_URI,POPULATED_PLACE_TYPE,DISTRICT_BOROUGH,DISTRICT_BOROUGH_URI,DISTRICT_BOROUGH_TYPE,COUNTY_UNITARY,COUNTY_UNITARY_URI,COUNTY_UNITARY_TYPE,REGION,REGION_URI,COUNTRY,COUNTRY_URI,RELATED_SPATIAL_OBJECT,SAME_AS_DBPEDIA,SAME_AS_GEONAMES\r\n";

/** Doc/licence.txt as OS ships it, in Windows-1252 (the © is the single byte 0xA9). */
export const OS_NAMES_LICENCE_FILE = Buffer.from(
  "                         ORDNANCE SURVEY DATA LICENCE\r\n\r\nYour use of OS OpenData is subject to the terms at http://os.uk/opendata/licence.\r\n \r\nThe copyright acknowledgements to use for the attribution statement are:\r\n \r\nContains OS data \u00a9 Crown Copyright and database rights 2026.\r\n\r\nContains Royal Mail data \u00a9 Royal Mail copyright and database right 2026.\r\n \r\nContains National Statistics data \u00a9 Crown copyright and database right 2026\r\n",
  "latin1",
);

/** The records, one CSV line each. */
export const OS_NAMES_SAMPLE: string[] = [
  'osgb4000000074570666,http://data.ordnancesurvey.co.uk/id/4000000074570666,Newport,,,,populatedPlace,Village,312590,923909,13000,250000,312028,923055,313210,925018,KW7,http://data.ordnancesurvey.co.uk/id/postcodedistrict/KW7,,,,,,,Highland,http://data.ordnancesurvey.co.uk/id/7000000000186625,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Scotland,http://data.ordnancesurvey.co.uk/id/7000000000041429,Scotland,http://data.ordnancesurvey.co.uk/id/country/scotland,,"http://dbpedia.org/resource/Newport,_Caithness",',
  "osgb4000000074604559,http://data.ordnancesurvey.co.uk/id/4000000074604559,Ben Nevis,eng,Beinn Nibheis,gla,landform,Hill Or Mountain,216666,771288,1000,300000,216442,771024,216942,771524,PH33,http://data.ordnancesurvey.co.uk/id/postcodedistrict/PH33,,,,,,,Highland,http://data.ordnancesurvey.co.uk/id/7000000000186625,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Scotland,http://data.ordnancesurvey.co.uk/id/7000000000041429,Scotland,http://data.ordnancesurvey.co.uk/id/country/scotland,,,",
  "osgb4000000074546065,http://data.ordnancesurvey.co.uk/id/4000000074546065,Glenridding,,,,populatedPlace,Village,338469,517064,9000,250000,337715,516627,339043,517476,CA11,http://data.ordnancesurvey.co.uk/id/postcodedistrict/CA11,,,,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,http://dbpedia.org/resource/Glenridding,http://sws.geonames.org/2648443",
  "osgb4000000074547827,http://data.ordnancesurvey.co.uk/id/4000000074547827,Ambleside,,,,populatedPlace,Town,337621,504558,17000,2000000,337026,502831,338514,505488,LA22,http://data.ordnancesurvey.co.uk/id/postcodedistrict/LA22,,,,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,http://dbpedia.org/resource/Ambleside,http://sws.geonames.org/2657360",
  "osgb4000000074547832,http://data.ordnancesurvey.co.uk/id/4000000074547832,Grasmere,,,,populatedPlace,Village,333645,507578,19000,250000,332607,505911,334892,508805,LA22,http://data.ordnancesurvey.co.uk/id/postcodedistrict/LA22,,,,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,http://dbpedia.org/resource/Grasmere,http://sws.geonames.org/2648201",
  "LA229DB,http://data.ordnancesurvey.co.uk/id/postcodeunit/LA229DB,LA22 9DB,,,,other,Postcode,337685,504424,3500,18000,,,,,,,Ambleside,http://data.ordnancesurvey.co.uk/id/4000000074547827,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "LA229LJ,http://data.ordnancesurvey.co.uk/id/postcodeunit/LA229LJ,LA22 9LJ,,,,other,Postcode,337040,504279,3500,18000,,,,,,,,,,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "LA229RA,http://data.ordnancesurvey.co.uk/id/postcodeunit/LA229RA,LA22 9RA,,,,other,Postcode,333780,508365,3500,18000,,,,,,,Grasmere,http://data.ordnancesurvey.co.uk/id/4000000074547832,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#village,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "osgb4000000074792405,http://data.ordnancesurvey.co.uk/id/4000000074792405,Grasmere,,,,hydrography,Inland Water,333774,506608,10000,500000,333253,505869,334340,507346,LA22,http://data.ordnancesurvey.co.uk/id/postcodedistrict/LA22,,,,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "osgb4000000074601764,http://data.ordnancesurvey.co.uk/id/4000000074601764,Helvellyn,,,,landform,Hill Or Mountain,334258,515105,1000,300000,334008,514855,334508,515355,CA12,http://data.ordnancesurvey.co.uk/id/postcodedistrict/CA12,,,,,,,Westmorland and Furness,http://data.ordnancesurvey.co.uk/id/7000000000183844,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "osgb4000000074600634,http://data.ordnancesurvey.co.uk/id/4000000074600634,Scafell Pike,,,,landform,Hill Or Mountain,321545,507217,1000,300000,321295,506967,321795,507467,CA20,http://data.ordnancesurvey.co.uk/id/postcodedistrict/CA20,,,,,,,Cumberland,http://data.ordnancesurvey.co.uk/id/7000000000183845,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "osgb4000000007834235,http://data.ordnancesurvey.co.uk/id/4000000007834235,Grasmere,,,,transportNetwork,Named Road,425300,534819,1000,20000,425259,534769,425378,534907,DL16,http://data.ordnancesurvey.co.uk/id/postcodedistrict/DL16,Spennymoor,http://data.ordnancesurvey.co.uk/id/4000000074556721,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,County Durham,http://data.ordnancesurvey.co.uk/id/7000000000043607,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,North East,http://data.ordnancesurvey.co.uk/id/7000000000041422,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "osgb4000000009450523,http://data.ordnancesurvey.co.uk/id/4000000009450523,Ambleside,,,,transportNetwork,Named Road,355141,405183,1000,20000,355098,405167,355180,405198,WN5,http://data.ordnancesurvey.co.uk/id/postcodedistrict/WN5,Wigan,http://data.ordnancesurvey.co.uk/id/4000000074548561,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,Wigan,http://data.ordnancesurvey.co.uk/id/7000000000018868,http://data.ordnancesurvey.co.uk/ontology/admingeo/MetropolitanDistrict,,,,North West,http://data.ordnancesurvey.co.uk/id/7000000000041431,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  'osgb4000000073305575,http://data.ordnancesurvey.co.uk/id/4000000073305575,Myddelton College,,,,other,"Further Education,Non State Primary Education,Non State Secondary Education",305591,365940,3000,50000,305349,365690,305849,366190,LL16,http://data.ordnancesurvey.co.uk/id/postcodedistrict/LL16,Dinbych / Denbigh,http://data.ordnancesurvey.co.uk/id/4000000074571091,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ddinbych - Denbighshire,http://data.ordnancesurvey.co.uk/id/7000000000025487,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,',
  'osgb4000000074563224,http://data.ordnancesurvey.co.uk/id/4000000074563224,Newport,,,,populatedPlace,Town,374561,319092,22000,2000000,373460,317325,375888,320641,TF10,http://data.ordnancesurvey.co.uk/id/postcodedistrict/TF10,,,,,,,Telford and Wrekin,http://data.ordnancesurvey.co.uk/id/7000000000038854,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,West Midlands,http://data.ordnancesurvey.co.uk/id/7000000000041426,England,http://data.ordnancesurvey.co.uk/id/country/england,,"http://dbpedia.org/resource/Newport,_Shropshire",http://sws.geonames.org/2641595',
  "SY231SA,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231SA,SY23 1SA,,,,other,Postcode,259264,279894,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY233RZ,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY233RZ,SY23 3RZ,,,,other,Postcode,259621,279949,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY231AF,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231AF,SY23 1AF,,,,other,Postcode,259070,279868,3500,18000,,,,,,,,,,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY231RJ,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231RJ,SY23 1RJ,,,,other,Postcode,258916,279935,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY231ST,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231ST,SY23 1ST,,,,other,Postcode,259122,279983,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY231SQ,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231SQ,SY23 1SQ,,,,other,Postcode,259360,279945,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY231RL,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231RL,SY23 1RL,,,,other,Postcode,258875,279931,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY231SG,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231SG,SY23 1SG,,,,other,Postcode,259375,279876,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY231RY,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY231RY,SY23 1RY,,,,other,Postcode,259188,279982,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  'osgb4000000074568218,http://data.ordnancesurvey.co.uk/id/4000000074568218,Llanbadarn Fawr,,,,populatedPlace,Village,259964,280854,14000,250000,258965,280149,261095,281618,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,,,,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,"http://dbpedia.org/resource/Llanbadarn_Fawr,_Ceredigion",http://sws.geonames.org/2644182',
  "osgb4000000074568219,http://data.ordnancesurvey.co.uk/id/4000000074568219,Penparcau,,,,populatedPlace,Suburban Area,259170,280383,9000,25000,258647,279695,260000,280835,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,,,,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,http://dbpedia.org/resource/Penparcau,http://sws.geonames.org/6946746",
  "osgb4000000074568537,http://data.ordnancesurvey.co.uk/id/4000000074568537,Aberystwyth,,,,populatedPlace,Town,258382,281709,29000,2000000,257809,278480,261684,282919,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,,,,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,http://dbpedia.org/resource/Aberystwyth,http://sws.geonames.org/2657782",
  "osgb4000000017388099,http://data.ordnancesurvey.co.uk/id/4000000017388099,Lon Ystwyth,,,,transportNetwork,Named Road,259771,282200,1000,20000,259728,282188,259792,282238,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "osgb4000000017392925,http://data.ordnancesurvey.co.uk/id/4000000017392925,Ffordd Caradog,cym,Caradog Road,eng,transportNetwork,Named Road,259071,281775,2000,20000,258960,281673,259235,281862,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "b36529fe-0914-4300-9216-eca232d969a3,http://data.ordnancesurvey.co.uk/id/b36529fe-0914-4300-9216-eca232d969a3,Cefnllan,,,,transportNetwork,Section Of Named Road,259994,281347,4000,25000,259936,281063,260046,281612,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,Llanbadarn Fawr,http://data.ordnancesurvey.co.uk/id/4000000074568218,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#village,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,osgb4000000017387576,,",
  "osgb4000000074617040,http://data.ordnancesurvey.co.uk/id/4000000074617040,Constitution Hill,,,,landform,Hill Or Mountain,258797,282826,1000,300000,258547,282576,259047,283076,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,,,,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "osgb4000000074617039,http://data.ordnancesurvey.co.uk/id/4000000074617039,Pendinas,,,,landform,Hill Or Mountain,258436,280216,1000,300000,258186,279966,258686,280466,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,,,,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "osgb4000000073551580,http://data.ordnancesurvey.co.uk/id/4000000073551580,Aberystwyth,,,,transportNetwork,Railway Station,258690,281280,1000,50000,258440,281022,258940,281522,SY23,http://data.ordnancesurvey.co.uk/id/postcodedistrict/SY23,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "osgb5000005330268124,http://data.ordnancesurvey.co.uk/id/5000005330268124,Scafell Pike,,,,transportNetwork,Named Road,453708,191931,1000,20000,453678,191915,453799,191985,OX11,http://data.ordnancesurvey.co.uk/id/postcodedistrict/OX11,Didcot,http://data.ordnancesurvey.co.uk/id/4000000074552508,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,South Oxfordshire,http://data.ordnancesurvey.co.uk/id/7000000000008253,http://data.ordnancesurvey.co.uk/ontology/admingeo/District,Oxfordshire,http://data.ordnancesurvey.co.uk/id/7000000000008328,http://data.ordnancesurvey.co.uk/ontology/admingeo/County,South East,http://data.ordnancesurvey.co.uk/id/7000000000041421,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "PO304ET,http://data.ordnancesurvey.co.uk/id/postcodeunit/PO304ET,PO30 4ET,,,,other,Postcode,438958,83864,3500,18000,,,,,,,Brook,http://data.ordnancesurvey.co.uk/id/4000000074316130,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#village,,,,Isle of Wight,http://data.ordnancesurvey.co.uk/id/7000000000025469,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,South East,http://data.ordnancesurvey.co.uk/id/7000000000041421,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "PO304LD,http://data.ordnancesurvey.co.uk/id/postcodeunit/PO304LD,PO30 4LD,,,,other,Postcode,439029,83773,3500,18000,,,,,,,Brook,http://data.ordnancesurvey.co.uk/id/4000000074316130,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#village,,,,Isle of Wight,http://data.ordnancesurvey.co.uk/id/7000000000025469,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,South East,http://data.ordnancesurvey.co.uk/id/7000000000041421,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "PO304EL,http://data.ordnancesurvey.co.uk/id/postcodeunit/PO304EL,PO30 4EL,,,,other,Postcode,438690,84356,3500,18000,,,,,,,Dunsbury,http://data.ordnancesurvey.co.uk/id/4000000074551413,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#hamlet,,,,Isle of Wight,http://data.ordnancesurvey.co.uk/id/7000000000025469,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,South East,http://data.ordnancesurvey.co.uk/id/7000000000041421,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  'osgb4000000074549183,http://data.ordnancesurvey.co.uk/id/4000000074549183,Newport,,,,populatedPlace,Town,449979,89192,33000,2000000,447590,87241,451890,92366,PO30,http://data.ordnancesurvey.co.uk/id/postcodedistrict/PO30,,,,,,,Isle of Wight,http://data.ordnancesurvey.co.uk/id/7000000000025469,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,South East,http://data.ordnancesurvey.co.uk/id/7000000000041421,England,http://data.ordnancesurvey.co.uk/id/country/england,,"http://dbpedia.org/resource/Newport,_Isle_of_Wight",http://sws.geonames.org/2641599',
  'osgb4000000074555171,http://data.ordnancesurvey.co.uk/id/4000000074555171,Newport,,,,populatedPlace,Village,552165,234025,14000,250000,551398,232906,552327,235019,CB11,http://data.ordnancesurvey.co.uk/id/postcodedistrict/CB11,,,,Uttlesford,http://data.ordnancesurvey.co.uk/id/7000000000020033,http://data.ordnancesurvey.co.uk/ontology/admingeo/District,Essex,http://data.ordnancesurvey.co.uk/id/7000000000176289,http://data.ordnancesurvey.co.uk/ontology/admingeo/County,Eastern,http://data.ordnancesurvey.co.uk/id/7000000000041425,England,http://data.ordnancesurvey.co.uk/id/country/england,,"http://dbpedia.org/resource/Newport,_Essex",http://sws.geonames.org/2641597',
  "osgb4000000030526160,http://data.ordnancesurvey.co.uk/id/4000000030526160,Ambleside,,,,transportNetwork,Named Road,538987,170774,1000,20000,538928,170736,539039,170843,BR1,http://data.ordnancesurvey.co.uk/id/postcodedistrict/BR1,London,http://data.ordnancesurvey.co.uk/id/4000000074813508,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#city,Lewisham,http://data.ordnancesurvey.co.uk/id/7000000000011039,http://data.ordnancesurvey.co.uk/ontology/admingeo/LondonBorough,Greater London,http://data.ordnancesurvey.co.uk/id/7000000000041441,http://data.ordnancesurvey.co.uk/ontology/admingeo/GreaterLondonAuthority,London,http://data.ordnancesurvey.co.uk/id/7000000000041428,England,http://data.ordnancesurvey.co.uk/id/country/england,,,",
  "SY233FL,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY233FL,SY23 3FL,,,,other,Postcode,259643,281982,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY233QN,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY233QN,SY23 3QN,,,,other,Postcode,259486,281249,3500,18000,,,,,,,Llanbadarn Fawr,http://data.ordnancesurvey.co.uk/id/4000000074568218,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#village,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY233UG,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY233UG,SY23 3UG,,,,other,Postcode,259355,281846,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
  "SY233BY,http://data.ordnancesurvey.co.uk/id/postcodeunit/SY233BY,SY23 3BY,,,,other,Postcode,259667,282002,3500,18000,,,,,,,Aberystwyth,http://data.ordnancesurvey.co.uk/id/4000000074568537,http://www.ordnancesurvey.co.uk/xml/codelists/localtype.xml#town,,,,Sir Ceredigion - Ceredigion,http://data.ordnancesurvey.co.uk/id/7000000000025485,http://data.ordnancesurvey.co.uk/ontology/admingeo/UnitaryAuthority,Wales,http://data.ordnancesurvey.co.uk/id/7000000000041424,Wales,http://data.ordnancesurvey.co.uk/id/country/wales,,,",
];

/** The zip as OS lays it out: Doc/, Data/ in 20 km squares (here two files), and a readme. */
export function osNamesZip(lines: string[] = OS_NAMES_SAMPLE): Buffer {
  const half = Math.ceil(lines.length / 2);
  const bom = "\uFEFF";
  return buildZip([
    { name: "Data/NY20.csv", content: `${bom}${lines.slice(0, half).join("\r\n")}\r\n` },
    { name: "Data/SN68.csv", content: `${bom}${lines.slice(half).join("\r\n")}\r\n` },
    { name: "Doc/licence.txt", content: OS_NAMES_LICENCE_FILE },
    { name: "Doc/OS_Open_Names_Header.csv", content: OS_NAMES_HEADER_FILE },
    { name: "readme.txt", content: "Notes on the Supply of Ordnance Survey Digital Data\r\n" },
  ]);
}

export interface OsNamesStandIn {
  /** The API's address, to give as OUTPOST_OS_DOWNLOADS_URL: ".../os-downloads/". */
  readonly base: string;
  zip: Buffer;
  edition: string;
  /** Every request seen, as "METHOD path range". */
  requests: string[];
  /** Set to a status to answer the file with it; null to answer normally. */
  failFileWith: number | null;
  /** Cut the file's answer off after this many bytes, once; null to send it whole. */
  cutAfter: number | null;
  /** Answer the list with a different checksum, as if the file had been tampered with. */
  wrongMd5: boolean;
  handle(request: http.IncomingMessage, response: http.ServerResponse): void;
  /** For tests on their own: a server of its own on a free port. */
  listen(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Stands in for api.os.uk's Downloads API under `<origin>/os-downloads/`: the product's
 * details, its list of downloads, and the download, which redirects (307, as OS does) to
 * the file under `<origin>/os-files/`, where ranges are honoured.
 */
export function createOsNamesStandIn(given?: () => string, options: { edition?: string; zip?: Buffer } = {}): OsNamesStandIn {
  let server: http.Server | undefined;
  let listening = "";
  const origin = () => listening || given?.() || "";
  const state: OsNamesStandIn = {
    get base() {
      return `${origin()}/os-downloads/`;
    },
    zip: options.zip ?? osNamesZip(),
    edition: options.edition ?? "2026-10",
    requests: [],
    failFileWith: null,
    cutAfter: null,
    wrongMd5: false,
    handle(request, response) {
      const url = new URL(request.url ?? "/", "http://stand-in");
      state.requests.push(`${request.method} ${url.pathname} ${request.headers.range ?? ""}`.trim());
      const json = (body: unknown) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
      const md5 = state.wrongMd5 ? "0".repeat(32) : createHash("md5").update(state.zip).digest("hex");
      if (url.pathname === "/os-downloads/products/OpenNames") {
        return json({ id: "OpenNames", name: "OS Open Names", version: state.edition, areas: ["GB"] });
      }
      if (url.pathname === "/os-downloads/products/OpenNames/downloads") {
        const entry = (format: string, fileName: string, size: number) => ({
          md5: format === "CSV" ? md5 : "1".repeat(32),
          size,
          url: `${origin()}/os-downloads/products/OpenNames/downloads?area=GB&format=${format}&redirect`,
          format,
          area: "GB",
          fileName,
        });
        if (url.searchParams.has("redirect")) {
          response.writeHead(307, { location: `${origin()}/os-files/OpenNames/${state.edition}/opname_csv_gb.zip?sig=stand-in` }).end();
          return;
        }
        return json([entry("CSV", "opname_csv_gb.zip", state.zip.length), entry("GeoPackage", "opname_gpkg_gb.zip", 209544222)]);
      }
      if (url.pathname.startsWith("/os-files/")) {
        if (state.failFileWith) return void response.writeHead(state.failFileWith).end();
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
        const start = match ? Number(match[1]) : 0;
        if (start >= state.zip.length) {
          return void response.writeHead(416, { "content-range": `bytes */${state.zip.length}` }).end();
        }
        const slice = state.zip.subarray(start);
        const headers: Record<string, string> = { "content-type": "application/zip", "content-length": String(slice.length) };
        if (match) headers["content-range"] = `bytes ${start}-${state.zip.length - 1}/${state.zip.length}`;
        response.writeHead(match ? 206 : 200, headers);
        if (state.cutAfter !== null) {
          const cut = state.cutAfter;
          state.cutAfter = null;
          // Let the bytes reach the client, then cut the line mid-answer.
          response.write(slice.subarray(0, cut), () => setTimeout(() => response.destroy(), 30));
          return;
        }
        response.end(slice);
        return;
      }
      response.writeHead(404).end();
    },
    async listen() {
      server = http.createServer((request, response) => state.handle(request, response));
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
      listening = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    },
    async close() {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    },
  };
  return state;
}
