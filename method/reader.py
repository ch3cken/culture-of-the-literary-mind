import os
import json
import csv
from langdetect import detect, LangDetectException

COUNT = 0

decades = ["1890","1900","1910","1920","1930","1940","1950","1960","1970","1980","1990","2000"]
topics_per_decade = {
    "1890": {},
    "1900": {},
    "1910": {},
    "1920": {},
    "1930": {},
    "1940": {},
    "1950": {},
    "1960": {},
    "1970": {},
    "1980": {},
    "1990": {},
    "2000": {}
}

for decade in decades:
    # decade = "1960"
    filepath = os.path.join("mod_data", f"{decade}s_authors.json")
    with open(filepath, "r", encoding="utf-8") as file:
        authors = json.load(file)
        print("Number of authors: " + str(len(authors)))
        for author in authors:
            author_subjects = set()
            for s in set(author['Subjects']):
                subject = s.lower()
                if subject in author_subjects:
                    continue
                elif "fiction" in subject:
                    if "in fiction" not in subject:
                        continue
                elif subject == "general":
                    continue
                
                author_subjects.add(subject)
                    
                if subject in topics_per_decade[decade]:
                    topics_per_decade[decade][subject] += 1
                else:
                    topics_per_decade[decade][subject] = 1

    sorted_dict = dict(sorted(topics_per_decade[decade].items(), key=lambda item: item[1]))
    # print(sorted_dict)

# Filter out topics with a frequency of less than 5 and non-English topics
filtered_topics_per_decade = {}
known_english = set()
known_non_english = set()

for dec, topics in topics_per_decade.items():
    valid_topics = {}
    for subj, count in topics.items():
        if count >= COUNT:
            # Check memory first so we don't ask about the same subject twice
            if subj in known_english:
                valid_topics[subj] = count
                continue
            elif subj in known_non_english:
                continue

            try:
                # Detect language; only keep if it is English
                if detect(subj) == 'en':
                    valid_topics[subj] = count
                    known_english.add(subj)
                else:
                    # Prompt the user for confirmation
                    ans = input(f"Langdetect flagged '{subj}' as non-English. Is it actually English? (y/n): ").strip().lower()
                    if ans == 'y':
                        valid_topics[subj] = count
                        known_english.add(subj)
                    else:
                        known_non_english.add(subj)
            except LangDetectException:
                # If langdetect fails (e.g., the subject is just a date like "1939-1945"), keep it
                valid_topics[subj] = count
                known_english.add(subj)
    filtered_topics_per_decade[dec] = valid_topics

# Dump the resulting dictionary to a JSON file
with open("topics_per_decade.json", "w", encoding="utf-8") as json_file:
    json.dump(topics_per_decade, json_file, indent=4)

# Dump to CSV in Long Format
with open("topics_trends_long.csv", "w", newline="", encoding="utf-8") as csv_file:
    writer = csv.writer(csv_file)
    writer.writerow(["Subject", "Decade", "Frequency"])
    
    for dec in decades:
        for subject, count in filtered_topics_per_decade[dec].items():
            writer.writerow([subject, dec, count])