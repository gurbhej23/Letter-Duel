"""
Word definitions & hint provider for Letter Duel.
Supplies concise definitions for words to provide deduction clues during matches.
"""
import re
import urllib.request
import json
import logging

logger = logging.getLogger("game.definitions")

# Curated concise dictionary for common words and duel classics
DEFINITIONS_MAP = {
    # 3-4 letters
    "CAT": "A small domesticated carnivorous feline",
    "DOG": "A loyal domesticated canine mammal",
    "SUN": "The star at the center of our solar system",
    "SEA": "A large body of salt water",
    "SKY": "The upper atmosphere seen from Earth",
    "WAR": "A state of armed conflict between nations",
    "WIN": "Be successful or victorious in a contest",
    "ZOO": "An establishment where wild animals are kept for study and display",
    "BOOK": "A written or printed work consisting of pages",
    "CITY": "A large human settlement and urban center",
    "COLD": "Of or at a low temperature",
    "DARK": "With little or no light",
    "DUEL": "A prearranged combat between two people",
    "FIRE": "Combustion or burning producing heat and light",
    "FISH": "A limbless cold-blooded vertebrate living in water",
    "GAME": "A form of play or sport governed by rules",
    "GOLD": "A precious yellow metallic chemical element",
    "HERO": "A person admired for courage or outstanding achievements",
    "IRON": "A strong, magnetic silvery-gray metal",
    "KING": "The male sovereign ruler of an independent state",
    "LION": "A large tawny cat, known as the king of beasts",
    "MOON": "The natural satellite that orbits the Earth",
    "RAIN": "Water falling in drops condensed from vapor",
    "ROSE": "A fragrant flower with thorny stems",
    "SHIP": "A large boat for transporting people or goods by sea",
    "SNOW": "Atmospheric water vapor frozen into ice crystals",
    "STAR": "A luminous celestial point in the night sky",
    "WIND": "The natural movement of the air",
    "WOLF": "A wild carnivorous mammal of the dog family",
    # 5 letters
    "APPLE": "A round fruit with crisp flesh and red or green skin",
    "BEACH": "A sandy or pebbly shore by the ocean or lake",
    "BRAIN": "The organ of soft nervous tissue inside the skull",
    "BREAD": "Food made of flour, water, and yeast baked together",
    "CLOCK": "An instrument for measuring and indicating time",
    "CLOUD": "A visible mass of condensed water vapor in the sky",
    "DREAM": "A series of thoughts, images, or sensations during sleep",
    "EARTH": "The planet on which we live",
    "FLAME": "A hot glowing body of ignited gas produced by fire",
    "FRUIT": "The sweet seed-bearing structure of a flowering plant",
    "GHOST": "The spirit of a deceased person",
    "GLASS": "A hard, brittle, transparent substance",
    "GRAPE": "A small sweet round berry grown on vines",
    "GREEN": "The color between blue and yellow, like grass",
    "HEART": "The muscular organ that pumps blood through the body",
    "HORSE": "A large solid-hoofed plant-eating domesticated mammal",
    "HOUSE": "A building for human habitation",
    "JUICE": "The liquid extracted from fruit or vegetables",
    "LEMON": "A yellow citrus fruit with sour acidic juice",
    "LIGHT": "The natural agent that stimulates sight and makes things visible",
    "MONEY": "A current medium of exchange in the form of coins and banknotes",
    "MUSIC": "Vocal or instrumental sounds combined to produce beauty of form",
    "NIGHT": "The period of darkness between sunset and sunrise",
    "OCEAN": "A very large expanse of sea, covering much of Earth",
    "PEACE": "A state of tranquility, calm, and absence of hostility",
    "PHONE": "A telecommunications device used to transmit sound",
    "PIANO": "A large musical instrument with keyboard and strings",
    "PLANT": "A living organism of the vegetable kingdom",
    "QUEEN": "The female sovereign ruler or consort of a king",
    "RADIO": "The transmission and reception of electromagnetic signals",
    "RIVER": "A large natural stream of water flowing to sea or lake",
    "ROBOT": "A machine capable of carrying out complex actions automatically",
    "SHARK": "A predatory marine fish with cartilaginous skeleton",
    "SWORD": "A weapon with a long metal blade and hilt",
    "SHIELD": "A broad piece of metal or wood held for defense",
    "TIGER": "A very large solitary cat with a yellow-brown striped coat",
    "TRAIN": "A series of connected railway carriages or wagons",
    "WATER": "A colorless, transparent, odorless liquid essential for life",
    "WHALE": "A very large marine mammal that breathes air through blowholes",
    "ZEBRA": "An African wild horse with black-and-white stripes",
    # 6-8 letters
    "BANANA": "A long curved fruit with a yellow skin and soft sweet flesh",
    "BANANAS": "A cluster of curved sweet yellow tropical fruits",
    "BATTLE": "A sustained fight between large organized armed forces",
    "CAMERA": "A device for recording visual images",
    "CASTLE": "A large fortified building or fortress from medieval times",
    "COFFEE": "A hot drink brewed from roasted and ground coffee beans",
    "DANGER": "The possibility of suffering harm or injury",
    "DOCTOR": "A qualified practitioner of medicine",
    "DRAGON": "A mythical monster resembling a giant reptile with wings",
    "FALCON": "A bird of prey with long pointed wings and swift flight",
    "FLOWER": "The seed-bearing part of a plant with colorful petals",
    "FOREST": "A large area covered chiefly with trees and undergrowth",
    "GALAXY": "A system of millions or billions of stars bound by gravity",
    "GUITAR": "A stringed musical instrument played with fingers or pick",
    "ISLAND": "A piece of land surrounded entirely by water",
    "JUNGLE": "An area of dense tropical forest and tangled vegetation",
    "KNIGHT": "A medieval warrior of noble birth serving a sovereign",
    "LIZARD": "A reptile with a long body, four legs, and a tapering tail",
    "MONKEY": "A small to medium-sized primate with long tail",
    "ORANGE": "A round citrus fruit with a tough bright reddish-yellow rind",
    "PALACE": "A large and impressive residence of royalty or state leaders",
    "PLANET": "A celestial body moving in an elliptical orbit around a star",
    "POISON": "A substance that causes illness or death when absorbed",
    "ROCKET": "A cylindrical projectile or vehicle propelled by exhaust gases",
    "SHADOW": "A dark area or shape produced by a body coming between rays of light",
    "SILVER": "A precious shiny grayish-white metallic element",
    "SUMMER": "The warmest season of the year, between spring and autumn",
    "TARGET": "An objective or mark to be hit by a projectile",
    "TEMPLE": "A building devoted to the worship of a god or deities",
    "TUNNEL": "An underground or underwater passage",
    "TURTLE": "A slow-moving reptile with a hard bony shell",
    "WIZARD": "A man who has magical powers; a sorcerer or magician",
    "YELLOW": "The color of gold, butter, or ripe lemons",
    "ZENITH": "The highest point reached by a celestial body; the peak",
    "WARRIOR": "A brave or experienced soldier or fighter",
    "DIAMOND": "A precious stone consisting of clear and pure crystallized carbon",
    "DOLPHIN": "An intelligent gregarious aquatic mammal with curved fin",
    "ELEMENT": "A fundamental constituent or essential building block",
    "EMERALD": "A bright green precious gemstone",
    "FEATHER": "The flat plumage structure that grows from a bird's skin",
    "HARVEST": "The season or process of gathering ripe crops",
    "HORIZON": "The line where the earth's surface and the sky appear to meet",
    "JOURNEY": "An act of traveling from one place to another",
    "LIBRARY": "A building or room containing collections of books and media",
    "MACHINE": "An apparatus using mechanical power to perform a task",
    "MESSAGE": "A verbal, written, or recorded communication sent to someone",
    "MIRACLE": "An extraordinary event taken as a sign of divine intervention",
    "MISSION": "An important assignment or journey given to a person or group",
    "MONSTER": "A large, ugly, and frightening imaginary creature",
    "MORNING": "The early period of the day from sunrise to noon",
    "MOUNTAIN": "A large natural elevation of the earth's surface rising abruptly",
    "MYSTERY": "Something that is difficult or impossible to understand or explain",
    "OCTOPUS": "An eight-armed soft-bodied marine mollusk",
    "PACKAGE": "An object or bundle enclosed in paper or cardboard",
    "RAINBOW": "An arch of colors formed in the sky by refraction of sunlight",
    "ROUTINE": "A sequence of actions regularly followed",
    "SCIENCE": "Systematic study of the structure and behavior of the physical world",
    "SILENCE": "Complete absence of sound or noise",
    "STADIUM": "A sports arena with tiered seating for spectators",
    "THUNDER": "A loud rumbling or crashing noise heard after lightning",
    "TORNADO": "A mobile destructive vortex of violently rotating winds",
    "TREASURE": "A quantity of precious metals, gems, or valuable objects",
    "TRIUMPH": "A great victory, achievement, or success",
    "UNIVERSE": "All existing matter and space considered as a whole; the cosmos",
    "VAMPIRE": "A mythical creature that subsists by drinking blood of the living",
    "VANILLA": "A sweet, aromatic flavoring derived from tropical orchid pods",
    "VOLCANO": "A mountain with a crater through which lava and gas erupt",
    "WEATHER": "The state of the atmosphere with respect to heat, wind, rain",
    # 9-13+ letters
    "ADVENTURE": "An unusual and exciting, typically hazardous, experience",
    "ASTRONOMY": "The scientific study of celestial objects, space, and the universe",
    "BLUEPRINT": "A detailed design plan or technical drawing",
    "CHALLENGE": "A call to take part in a contest or demanding task",
    "CHARACTER": "The mental and moral qualities distinctive to an individual",
    "CHOCOLATE": "A sweet food preparation made from roasted cacao seeds",
    "COMMANDER": "A person in authority, especially over military forces",
    "DETECTIVE": "An investigator whose occupation is to solve crimes",
    "DIMENSION": "A measurable extent of some kind, such as length, depth, or time",
    "DISCOVERY": "The act of finding or learning something for the first time",
    "EDUCATION": "The process of receiving or giving systematic instruction",
    "EVOLUTION": "The gradual development of something into a more complex form",
    "FANTASTIC": "Extraordinarily good, attractive, or imaginative",
    "GLADIATOR": "An armed combatant who entertained audiences in ancient Rome",
    "KNOWLEDGE": "Facts, information, and skills acquired through experience",
    "LANDSCAPE": "All the visible features of an area of countryside or land",
    "LIGHTNING": "The natural electrical discharge between cloud and ground",
    "MECHANISM": "A system of parts working together in a machine",
    "MILLENNIUM": "A period of one thousand years",
    "NAVIGATOR": "A person who directs the route or course of a ship or aircraft",
    "NIGHTMARE": "A frightening or unpleasant dream",
    "OPERATION": "An active process; an act of surgery or strategic mission",
    "ORCHESTRA": "A large group of instrumental musicians playing together",
    "PARACHUTE": "A cloth canopy that slows the descent of a falling person",
    "RADIATION": "The emission of energy as electromagnetic waves or moving particles",
    "SATELLITE": "An artificial body placed in orbit around the earth or moon",
    "SPACESHIP": "A spacecraft designed for travel beyond Earth's atmosphere",
    "SUPERHERO": "A fictional hero having extraordinary or superhuman powers",
    "TELESCOPE": "An optical instrument designed to make distant objects appear nearer",
    "TERRITORY": "An area of land under the jurisdiction of a ruler or state",
    "WATERFALL": "A cascade of water falling from a height over a precipice",
    "TRANQUILITY": "A state of peace, calmness, and serenity",
    "TRANQUILLITY": "A state of peace, calmness, and serenity",
    "CHAMPIONSHIP": "A contest for the position of champion in a sport or game",
    "ARCHITECTURE": "The art or practice of designing and constructing buildings",
    "BIODIVERSITY": "The variety of plant and animal life in the world or habitat",
    "CONSTELLATION": "A group of stars forming a recognizable pattern in the sky",
    "CRYPTOGRAPHY": "The art of writing or solving secret codes",
    "ELECTROMAGNET": "A soft metal core made into a magnet by electric current",
    "ENCYCLOPEDIA": "A comprehensive reference work containing information on all subjects",
    "INTELLIGENCE": "The ability to acquire and apply knowledge and skills",
    "MASTERPIECE": "A work of outstanding artistry, skill, or workmanship",
    "PHOTOGRAPHER": "A person who takes photographs, especially as a job",
    "THUNDERSTORM": "A storm with thunder and lightning and typically heavy rain",
    "TRANSPORTATION": "The action of transporting someone or something from place to place"
}

# Cache for dynamic dictionary API lookups
_LOOKUP_CACHE = {}

def get_word_definition(word: str) -> str:
    """
    Returns a concise definition or clue for the given word.
    Checks curated dictionary first, then lookup cache, then attempts a fast API fetch.
    Falls back gracefully if offline or not found.
    """
    if not word:
        return ""

    clean = word.strip().upper()

    # 1. Curated dictionary match
    if clean in DEFINITIONS_MAP:
        return DEFINITIONS_MAP[clean]

    # 2. Check memory cache
    if clean in _LOOKUP_CACHE:
        return _LOOKUP_CACHE[clean]

    # 3. Attempt quick online dictionary lookup
    try:
        url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{clean.lower()}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "LetterDuel/1.0"}
        )
        with urllib.request.urlopen(req, timeout=1.2) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list) and len(data) > 0:
                    meanings = data[0].get("meanings", [])
                    if meanings and len(meanings) > 0:
                        definitions = meanings[0].get("definitions", [])
                        if definitions and len(definitions) > 0:
                            definition_text = definitions[0].get("definition", "").strip()
                            if definition_text:
                                # Clean up definition and cap length
                                definition_text = re.sub(r'[\r\n]+', ' ', definition_text)
                                if len(definition_text) > 90:
                                    definition_text = definition_text[:87] + "..."
                                _LOOKUP_CACHE[clean] = definition_text
                                return definition_text
    except Exception as e:
        logger.debug(f"Dictionary API lookup skipped for {clean}: {e}")

    # 4. Fallback contextual hint
    length = len(clean)
    fallback = f"A {length}-letter English mystery word"
    _LOOKUP_CACHE[clean] = fallback
    return fallback
