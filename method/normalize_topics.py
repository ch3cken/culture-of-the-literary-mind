import json
import os

def main():
    chosen_topics_path = 'topics_per_decade_trunc.json'
    all_topics_path = 'topics_per_decade.json'
    
    # Check if the file exists
    if not os.path.exists(chosen_topics_path) and not os.path.exists(all_topics_path):
        print(f"Error: Could not find {chosen_topics_path} in the current directory.")
        return

    # Load the JSON data
    with open(chosen_topics_path, 'r', encoding='utf-8') as f:
        topic_data = json.load(f)

    with open(all_topics_path, 'r', encoding='utf-8') as f:
        all_topics = json.load(f)
    
    # 1. Collect all unique topics across all decades
    chosen_topics = set()
    for decade, topics in topic_data.items():
        for topic in topics.keys():
            chosen_topics.add(topic)

    # 2. Add missing topics to each decade with a frequency of 0
    for decade, topics in topic_data.items():
        for topic in chosen_topics:
            if topic not in topics:
                if topic in all_topics[decade]:
                    topic_data[decade][topic] = all_topics[decade][topic]
                    print(f"Appended {topic} to the list in decade {decade}!")
                

    # Save the updated JSON data back to the file
    with open(chosen_topics_path, 'w', encoding='utf-8') as f:
        json.dump(topic_data, f, indent=4)

    print(f"Successfully normalized {chosen_topics_path}!")
    print(f"Total unique topics across all decades: {len(chosen_topics)}")

if __name__ == '__main__':
    main()
