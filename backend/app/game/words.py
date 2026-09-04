import re
from typing import Tuple

# Common standard English words (5-15 letters)
STANDARD_DICTIONARY = {
    # 5 letters
    "apple", "beach", "brain", "bread", "brick", "bridge", "brown", "chair", "chest", "clock",
    "cloud", "dance", "dream", "earth", "flame", "fruit", "ghost", "glass", "grape", "green",
    "heart", "horse", "house", "juice", "knife", "lemon", "light", "money", "music", "night",
    "ocean", "onion", "paint", "paper", "party", "peace", "phone", "piano", "pilot", "plant",
    "plate", "queen", "radio", "river", "robot", "round", "scale", "scene", "shark", "sheep",
    "shirt", "smile", "snake", "space", "spoon", "stage", "steam", "storm", "sugar", "table",
    "tiger", "train", "water", "whale", "wheel", "white", "world", "zebra", "sword", "shield",
    "magic", "tower", "quest", "flute", "pearl", "crown", "spark", "blade", "arrow", "spear",
    "dragon", "castle", "knight", "wizard", "forest", "shadow", "silver", "golden", "bronze",
    # 6 letters
    "banana", "bottle", "camera", "candle", "carpet", "circle", "coffee", "cradle", "danger",
    "doctor", "dollar", "donkey", "dragon", "engine", "falcon", "finger", "flower", "forest",
    "garden", "garlic", "guitar", "hammer", "island", "jacket", "jungle", "kitten", "ladder",
    "lawyer", "lizard", "magnet", "monkey", "mother", "museum", "needle", "orange", "palace",
    "parrot", "pencil", "pepper", "person", "pigeon", "planet", "pocket", "poison", "potato",
    "prison", "puzzle", "rabbit", "rocket", "sailor", "school", "shadow", "shield", "silver",
    "spider", "spring", "stream", "street", "summer", "target", "temple", "ticket", "tomato",
    "tunnel", "turtle", "valley", "violin", "walnut", "weapon", "window", "winter", "wizard",
    "yellow", "yogurt", "zenith", "attack", "battle", "legend", "strike", "warrior", "galaxy",
    # 7 letters
    "academy", "aircraft", "airport", "ancient", "avocado", "balance", "bananas", "battery",
    "blanket", "browser", "buffalo", "cabinet", "capital", "captain", "caravan", "castle",
    "channel", "charger", "chimney", "climate", "compass", "crystal", "curtain", "dessert",
    "diamond", "dolphin", "drawing", "element", "emerald", "feather", "fighter", "firefly",
    "fortune", "gallery", "giraffe", "gorilla", "harvest", "holiday", "horizon", "iceberg",
    "journey", "leopard", "library", "lobster", "luggage", "machine", "mammoth", "message",
    "miracle", "mission", "monster", "morning", "mountain", "mystery", "network", "octopus",
    "officer", "olympic", "orchestra", "package", "painter", "panther", "patient", "peacock",
    "penguin", "perfume", "picture", "pioneer", "plastic", "popcorn", "postbox", "present",
    "project", "pyramid", "rainbow", "receipt", "reptile", "routine", "sandals", "sausage",
    "science", "scooter", "silence", "stadium", "statue", "stomach", "storage", "surgeon",
    "theater", "thunder", "tornado", "tractor", "traffic", "trainer", "treasure", "triumph",
    "tsunami", "uniform", "universe", "vampire", "vanilla", "vehicle", "village", "volcano",
    "vulture", "warrior", "weather", "whistle", "windows", "witness", "writing", "xylophone",
    # 8 letters
    "absolute", "airplane", "alphabet", "altitude", "aquarium", "artifact", "astronaut",
    "backbone", "backpack", "barbecue", "baseball", "birthday", "building", "calendar",
    "campfire", "category", "champion", "chemical", "colleague", "computer", "creature",
    "cucumber", "dinosaur", "director", "discover", "document", "electric", "elephant",
    "engineer", "equation", "explorer", "feedback", "festival", "firework", "flagship",
    "football", "fountain", "frontier", "governor", "graphics", "hardware", "headline",
    "hedgehog", "heritage", "hospital", "identity", "incident", "industry", "innocent",
    "interest", "internet", "invasion", "judgment", "keyboard", "language", "laughter",
    "magnetic", "midnight", "military", "minerals", "mosquito", "mountain", "movement",
    "mushroom", "musician", "navigate", "neighbor", "nightfall", "notebook", "novelist",
    "nutrient", "obstacle", "organism", "pandemic", "password", "patience", "pavement",
    "peacock", "pharmacy", "physical", "platform", "platinum", "playback", "portrait",
    "princess", "producer", "prospect", "question", "railroad", "reaction", "reliance",
    "resource", "response", "sandwich", "sapphire", "scenario", "scissors", "sculptor",
    "security", "sequence", "skeleton", "software", "solution", "souvenir", "spectrum",
    "splendid", "squirrel", "starship", "strength", "struggle", "sunlight", "surprise",
    "symbolic", "tactical", "terminal", "timeline", "triangle", "umbrella", "vacation",
    "variable", "velocity", "vertical", "veteran", "vigorous", "villager", "violence",
    "volcanic", "voyagers", "wildfire", "wireless", "workshop", "yearbook",
    # 9-12 letters
    "adventure", "astronomy", "blueprint", "challenge", "character", "chocolate", "commander",
    "detective", "dimension", "discovery", "education", "evolution", "explosion", "fantastic",
    "gladiator", "handshake", "knowledge", "landscape", "lightning", "mechanism", "melodious",
    "millennium", "navigator", "nightmare", "operation", "orchestra", "parachute", "perimeter",
    "radiation", "reflection", "satellite", "spaceship", "structure", "superhero", "telescope",
    "territory", "trapezoid", "vampirism", "waterfall", "wildflower", "xylophone",
    "championship", "architecture", "biodiversity", "constellation", "cryptography",
    "electromagnet", "encyclopedia", "illustration", "intelligence", "masterpiece",
    "neighborhood", "oceanography", "organization", "photographer", "refrigeration",
    "temperatures", "thunderstorm", "transmission", "transportation"
}

def validate_word(word: str, allow_custom: bool = True) -> Tuple[bool, str, str]:
    """
    Validates a secret word according to game rules:
    - Alphabetic characters only (no spaces, numbers, symbols)
    - Length between 5 and 15
    - Normalized to lowercase
    - If allow_custom is False, word must be in standard dictionary.
    
    Returns: (is_valid: bool, normalized_word: str, error_message: str)
    """
    if not word:
        return False, "", "Word cannot be empty."
    
    clean_word = word.strip().lower()
    
    if not re.match(r"^[a-z]+$", clean_word):
        return False, "", "Word must contain only alphabetic letters (A-Z) without numbers, spaces, or symbols."
    
    if len(clean_word) < 5:
        return False, "", "Word must contain at least 5 letters."
    
    if len(clean_word) > 15:
        return False, "", "Word cannot exceed 15 letters."
    
    if not allow_custom and clean_word not in STANDARD_DICTIONARY:
        return False, "", f"'{clean_word.upper()}' was not found in the standard dictionary. Please choose a recognized English word."
        
    return True, clean_word, ""
