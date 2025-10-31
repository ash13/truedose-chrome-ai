#!/usr/bin/env python3
"""
Subreddit Database Builder - Python Version
Extracts subreddit metadata and builds database without CORS issues
"""

import requests
import json
import csv
import time
from collections import Counter

def fetch_subreddit_data(subreddit_name):
    """Fetch subreddit info and top posts - extracts comprehensive metadata"""
    print(f"📥 Fetching r/{subreddit_name}...")
    
    try:
        # Fetch subreddit info
        about_url = f"https://www.reddit.com/r/{subreddit_name}/about.json"
        headers = {'User-Agent': 'SubredditDatabaseBuilder/1.0'}
        
        about_response = requests.get(about_url, headers=headers)
        about_response.raise_for_status()
        about_data = about_response.json()
        
        if 'error' in about_data:
            print(f"❌ Error: Subreddit not found or private")
            return None
        
        # Fetch top posts
        posts_url = f"https://www.reddit.com/r/{subreddit_name}/top.json?limit=50&t=month"
        posts_response = requests.get(posts_url, headers=headers)
        posts_response.raise_for_status()
        posts_data = posts_response.json()
        
        # Extract data from about endpoint
        subreddit_info = about_data['data']
        posts = posts_data['data']['children']
        
        # Extract keywords from post titles
        titles = [post['data']['title'] for post in posts]
        keywords = extract_keywords(titles)
        
        # Calculate engagement metrics
        total_score = sum(post['data']['score'] for post in posts)
        total_comments = sum(post['data']['num_comments'] for post in posts)
        avg_score = total_score / len(posts) if posts else 0
        avg_comments = total_comments / len(posts) if posts else 0
        
        # Fix description extraction - try multiple fields
        description = (
            subreddit_info.get('public_description') or 
            subreddit_info.get('description_html') or 
            subreddit_info.get('description') or 
            subreddit_info.get('title') or 
            ''
        )
        
        # Clean description (remove HTML tags if present)
        import re
        description_clean = re.sub(r'<[^>]+>', '', description).strip()
        
        # COMPREHENSIVE METADATA EXTRACTION
        result = {
            # Basic Info
            'name': subreddit_info['display_name'],
            'display_name_prefixed': subreddit_info.get('display_name_prefixed', f"r/{subreddit_info['display_name']}"),
            'title': subreddit_info.get('title', ''),
            'description': description_clean[:500] if description_clean else subreddit_info.get('title', ''),  # Use first 500 chars
            'description_long': description_clean[:1000] if description_clean else '',  # First 1000 chars
            
            # Size & Activity
            'subscribers': subreddit_info['subscribers'],
            'active_users': subreddit_info.get('active_user_count', 0),
            'created_utc': subreddit_info.get('created_utc', 0),
            
            # Community Type
            'subreddit_type': subreddit_info.get('subreddit_type', 'public'),
            'over18': subreddit_info.get('over18', False),
            'quarantine': subreddit_info.get('quarantine', False),
            
            # Engagement Metrics (from top posts)
            'top_posts_analyzed': len(posts),
            'avg_score': round(avg_score, 1),
            'avg_comments': round(avg_comments, 1),
            'total_engagement': total_score + total_comments,
            
            # Content Analysis
            'keywords': keywords,
            'top_keywords_str': ', '.join(keywords[:10]),  # For CSV
            
            # URL
            'url': f"https://reddit.com{subreddit_info.get('url', '')}",
        }
        
        print(f"✅ Found r/{result['name']} - {result['subscribers']:,} subscribers")
        print(f"   📊 Activity: {result['active_users']:,} active users")
        print(f"   📈 Avg engagement: {result['avg_score']:.0f} upvotes, {result['avg_comments']:.0f} comments")
        if result['description']:
            print(f"   📝 Description: {result['description'][:80]}...")
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching r/{subreddit_name}: {e}")
        return None
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return None

def extract_keywords(titles, top_n=15):
    """Extract most common keywords from post titles"""
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
                  'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                  'would', 'should', 'could', 'may', 'might', 'can', 'for', 'with',
                  'about', 'from', 'this', 'that', 'these', 'those', 'what', 'when',
                  'where', 'who', 'why', 'how', 'my', 'your', 'their', 'our', 'need',
                  'help', 'please', 'anyone', 'just', 'any'}
    
    words = []
    for title in titles:
        # Clean and split
        clean_title = ''.join(c if c.isalnum() or c.isspace() else ' ' for c in title.lower())
        words.extend([w for w in clean_title.split() if len(w) > 3 and w not in stop_words])
    
    # Count frequency
    word_counts = Counter(words)
    return [word for word, count in word_counts.most_common(top_n)]

def suggest_categories(name, description, keywords):
    """Suggest categories based on subreddit name and content using mapping approach"""
    
    # Comprehensive health topic mapping
    # Each pattern maps to (primary_topics, good_for) tuples
    HEALTH_TOPIC_MAP = {
        # Nutrition & Diet
        'nutrition': (['nutrition', 'diet', 'food'], ['immunity', 'energy', 'weight', 'gut', 'muscle', 'brain']),
        'diet': (['diet', 'nutrition', 'food'], ['weight', 'energy', 'health', 'gut']),
        'food': (['food', 'nutrition', 'diet'], ['energy', 'weight', 'health']),
        'eat': (['nutrition', 'diet', 'eating'], ['weight', 'energy', 'health', 'gut']),
        'meal': (['meal planning', 'nutrition', 'diet'], ['weight', 'energy', 'time management']),
        'calorie': (['diet', 'weight loss', 'nutrition'], ['weight', 'energy', 'fitness']),
        'recipe': (['cooking', 'food', 'nutrition'], ['health', 'weight', 'enjoyment']),
        
        # Gut & Digestion
        'gut': (['gut health', 'digestion', 'microbiome'], ['immunity', 'mental health', 'inflammation', 'digestion', 'skin']),
        'digestion': (['digestion', 'gut health', 'gastrointestinal'], ['gut', 'immunity', 'inflammation', 'comfort']),
        'stomach': (['digestive health', 'gut', 'gastro'], ['digestion', 'comfort', 'inflammation']),
        'intestine': (['gut health', 'digestion', 'microbiome'], ['immunity', 'digestion', 'inflammation']),
        'ibs': (['IBS', 'digestive disorders', 'gut health'], ['digestion', 'pain relief', 'quality of life']),
        'microbiome': (['microbiome', 'gut bacteria', 'digestion'], ['immunity', 'mental health', 'digestion', 'inflammation']),
        'probiotic': (['probiotics', 'gut health', 'supplements'], ['immunity', 'digestion', 'gut', 'mental health']),
        'bloat': (['digestive health', 'gut', 'nutrition'], ['digestion', 'comfort', 'weight']),
        
        # Immunity & Inflammation
        'immun': (['immunology', 'immune system', 'health'], ['immunity', 'autoimmune', 'inflammation', 'disease prevention']),
        'autoimmune': (['autoimmune', 'immunology', 'chronic illness'], ['inflammation', 'pain management', 'quality of life', 'immunity']),
        'inflammation': (['inflammation', 'health', 'wellness'], ['pain relief', 'immunity', 'chronic disease', 'recovery']),
        
        # Fitness & Exercise
        'fitness': (['fitness', 'exercise', 'workout'], ['weight', 'muscle', 'energy', 'mental health', 'strength']),
        'workout': (['workout', 'exercise', 'fitness'], ['muscle', 'weight', 'strength', 'endurance']),
        'exercise': (['exercise', 'fitness', 'activity'], ['weight', 'mental health', 'energy', 'longevity']),
        'gym': (['gym', 'fitness', 'strength training'], ['muscle', 'strength', 'weight', 'confidence']),
        'strength': (['strength training', 'fitness', 'muscle'], ['muscle', 'bone health', 'metabolism', 'confidence']),
        'cardio': (['cardio', 'fitness', 'endurance'], ['heart health', 'weight', 'endurance', 'energy']),
        'running': (['running', 'cardio', 'fitness'], ['endurance', 'weight', 'mental health', 'heart health']),
        
        # Weight Management
        'weight': (['weight loss', 'diet', 'fitness'], ['weight', 'confidence', 'energy', 'health']),
        'lose': (['weight loss', 'diet', 'fitness'], ['weight', 'confidence', 'health', 'energy']),
        'loseit': (['weight loss', 'diet', 'fitness'], ['weight', 'health', 'confidence', 'lifestyle']),
        'fat': (['fat loss', 'weight management', 'nutrition'], ['weight', 'body composition', 'health']),
        'obesity': (['obesity', 'weight management', 'health'], ['weight', 'health', 'longevity', 'quality of life']),
        
        # Mental Health
        'mental': (['mental health', 'psychology', 'wellness'], ['mental health', 'stress', 'mood', 'quality of life']),
        'depression': (['depression', 'mental health', 'mood'], ['mental health', 'mood', 'quality of life', 'coping']),
        'anxiety': (['anxiety', 'mental health', 'stress'], ['mental health', 'stress', 'calm', 'coping']),
        'stress': (['stress management', 'mental health', 'wellness'], ['stress', 'mental health', 'relaxation', 'sleep']),
        'mood': (['mood', 'mental health', 'emotional health'], ['mood', 'mental health', 'happiness', 'balance']),
        'therapy': (['therapy', 'mental health', 'counseling'], ['mental health', 'coping', 'healing', 'growth']),
        
        # Sleep
        'sleep': (['sleep', 'rest', 'sleep health'], ['sleep', 'mental health', 'energy', 'immunity', 'recovery']),
        'insomnia': (['insomnia', 'sleep disorders', 'sleep'], ['sleep', 'mental health', 'energy', 'quality of life']),
        'rest': (['rest', 'recovery', 'sleep'], ['recovery', 'sleep', 'energy', 'performance']),
        
        # Skin & Beauty
        'skin': (['skincare', 'dermatology', 'beauty'], ['skin', 'acne', 'aging', 'confidence', 'inflammation']),
        'acne': (['acne', 'skincare', 'dermatology'], ['skin', 'acne', 'confidence', 'inflammation']),
        'derma': (['dermatology', 'skin health', 'skincare'], ['skin', 'acne', 'conditions', 'aging']),
        'beauty': (['beauty', 'skincare', 'self-care'], ['skin', 'confidence', 'self-esteem', 'aging']),
        'wrinkle': (['anti-aging', 'skincare', 'beauty'], ['aging', 'skin', 'confidence', 'appearance']),
        
        # Supplements & Vitamins
        'supplement': (['supplements', 'vitamins', 'nutrition'], ['immunity', 'energy', 'cognition', 'health', 'performance']),
        'vitamin': (['vitamins', 'supplements', 'nutrition'], ['immunity', 'energy', 'bone health', 'cognition']),
        'mineral': (['minerals', 'nutrition', 'supplements'], ['bone health', 'energy', 'immunity', 'health']),
        'nootropic': (['nootropics', 'cognitive enhancement', 'supplements'], ['cognition', 'focus', 'memory', 'productivity']),
        
        # Specific Conditions
        'diabetes': (['diabetes', 'blood sugar', 'metabolic health'], ['blood sugar', 'weight', 'energy', 'longevity']),
        'blood sugar': (['blood sugar', 'diabetes', 'metabolic health'], ['blood sugar', 'energy', 'weight', 'diabetes']),
        'insulin': (['insulin', 'diabetes', 'metabolic health'], ['blood sugar', 'weight', 'energy', 'diabetes']),
        'heart': (['heart health', 'cardiovascular', 'cardiology'], ['heart health', 'longevity', 'exercise', 'blood pressure']),
        'cardiac': (['cardiac', 'heart health', 'cardiovascular'], ['heart health', 'longevity', 'prevention']),
        'cholesterol': (['cholesterol', 'heart health', 'cardiovascular'], ['heart health', 'longevity', 'diet', 'prevention']),
        'blood pressure': (['blood pressure', 'cardiovascular', 'heart health'], ['heart health', 'stress', 'longevity']),
        'cancer': (['cancer', 'oncology', 'chronic illness'], ['cancer support', 'quality of life', 'treatment', 'prevention']),
        'thyroid': (['thyroid', 'endocrine', 'hormones'], ['energy', 'weight', 'mood', 'hormones']),
        
        # Medical & General
        'doctor': (['medical advice', 'health', 'diagnosis'], ['health', 'diagnosis', 'treatment', 'symptoms']),
        'doc': (['medical advice', 'health', 'diagnosis'], ['health', 'diagnosis', 'treatment', 'prevention']),
        'medical': (['medical', 'health', 'healthcare'], ['health', 'diagnosis', 'treatment', 'prevention']),
        'health': (['health', 'wellness', 'lifestyle'], ['health', 'wellness', 'longevity', 'quality of life']),
        'wellness': (['wellness', 'health', 'lifestyle'], ['wellness', 'balance', 'quality of life', 'happiness']),
        
        # Hydration
        'water': (['hydration', 'water', 'health'], ['hydration', 'energy', 'skin', 'digestion', 'recovery']),
        'hydrat': (['hydration', 'water intake', 'health'], ['hydration', 'energy', 'performance', 'recovery']),
        
        # Fasting & Eating Patterns
        'fast': (['fasting', 'intermittent fasting', 'diet'], ['weight', 'metabolism', 'longevity', 'autophagy']),
        'intermittent': (['intermittent fasting', 'fasting', 'diet'], ['weight', 'metabolism', 'energy', 'longevity']),
        
        # Muscle & Body Composition
        'muscle': (['muscle building', 'fitness', 'bodybuilding'], ['muscle', 'strength', 'metabolism', 'confidence']),
        'protein': (['protein', 'nutrition', 'muscle building'], ['muscle', 'recovery', 'weight', 'satiety']),
        'bodybuilding': (['bodybuilding', 'muscle building', 'fitness'], ['muscle', 'strength', 'physique', 'discipline']),
        
        # Pain & Chronic Conditions
        'pain': (['pain management', 'chronic pain', 'health'], ['pain relief', 'quality of life', 'mobility', 'function']),
        'chronic': (['chronic illness', 'chronic conditions', 'health'], ['quality of life', 'management', 'coping', 'support']),
        'arthritis': (['arthritis', 'joint health', 'chronic pain'], ['pain relief', 'mobility', 'inflammation', 'quality of life']),
        
        # Energy & Performance
        'energy': (['energy', 'vitality', 'performance'], ['energy', 'productivity', 'endurance', 'recovery']),
        'fatigue': (['fatigue', 'energy', 'chronic fatigue'], ['energy', 'recovery', 'quality of life', 'diagnosis']),
        'performance': (['performance', 'optimization', 'fitness'], ['performance', 'energy', 'endurance', 'results']),
        
        # Cognitive Function
        'brain': (['brain health', 'cognitive function', 'neurology'], ['cognition', 'memory', 'focus', 'neuroprotection']),
        'memory': (['memory', 'cognitive function', 'brain health'], ['memory', 'cognition', 'brain health', 'aging']),
        'focus': (['focus', 'concentration', 'productivity'], ['focus', 'productivity', 'performance', 'cognition']),
        'cognit': (['cognitive function', 'brain health', 'mental performance'], ['cognition', 'memory', 'focus', 'brain health']),
    }
    
    # Combine name, description, and keywords for analysis
    combined_text = f"{name.lower()} {description.lower()} {' '.join(keywords).lower()}"
    
    # Find all matching patterns
    matched_topics = []
    matched_good_for = []
    
    for pattern, (topics, good_for_list) in HEALTH_TOPIC_MAP.items():
        if pattern in combined_text:
            matched_topics.extend(topics)
            matched_good_for.extend(good_for_list)
    
    # Remove duplicates while preserving order
    primary_topics = list(dict.fromkeys(matched_topics))[:5]  # Top 5
    good_for = list(dict.fromkeys(matched_good_for))[:6]  # Top 6
    
    # If no matches, use generic health categories
    if not primary_topics:
        primary_topics = ['health', 'wellness', 'lifestyle']
    if not good_for:
        good_for = ['health', 'wellness', 'quality of life']
    
    return primary_topics, good_for

def build_database(subreddit_list):
    """Build complete database from list of subreddit names"""
    database = []
    
    print(f"\n🏗️  Building database for {len(subreddit_list)} subreddits...\n")
    
    for i, subreddit_name in enumerate(subreddit_list, 1):
        print(f"[{i}/{len(subreddit_list)}] ", end="")
        
        data = fetch_subreddit_data(subreddit_name)
        
        if data:
            # Suggest categories
            primary_topics, good_for = suggest_categories(
                data['name'], 
                data['description'], 
                data['keywords']
            )
            
            # Include ALL metadata from fetch, plus add categorization
            entry = {
                'name': data['name'],
                'display_name_prefixed': data['display_name_prefixed'],
                'title': data['title'],
                'description': data['description'],  # ← This was missing!
                'subscribers': data['subscribers'],
                'active_users': data['active_users'],
                'created_utc': data['created_utc'],
                'subreddit_type': data['subreddit_type'],
                'over18': data['over18'],
                'quarantine': data['quarantine'],
                'top_posts_analyzed': data['top_posts_analyzed'],
                'avg_score': data['avg_score'],
                'avg_comments': data['avg_comments'],
                'total_engagement': data['total_engagement'],
                'keywords': data['keywords'][:10],  # Top 10 keywords
                'top_keywords_str': data['top_keywords_str'],
                'url': data['url'],
                'primary_topics': primary_topics,
                'good_for': good_for
            }
            
            database.append(entry)
            
            print(f"   Topics: {', '.join(primary_topics)}")
            print(f"   Good for: {', '.join(good_for)}\n")
        
        # Be nice to Reddit - wait between requests
        time.sleep(1)
    
    return database

def export_to_javascript(database, filename='subreddit_database.js'):
    """Export database as JavaScript constant"""
    js_code = f"const HEALTH_SUBREDDITS = {json.dumps(database, indent=2)};\n"
    
    with open(filename, 'w') as f:
        f.write(js_code)
    
    print(f"\n✅ Exported to {filename}")
    return js_code

def export_to_json(database, filename='subreddit_database.json'):
    """Export database as JSON"""
    with open(filename, 'w') as f:
        json.dump(database, f, indent=2)
    
    print(f"✅ Exported to {filename}")

def export_to_csv(database, filename='subreddit_database.csv'):
    """Export database as CSV with all metadata"""
    if not database:
        print("❌ No data to export")
        return
    
    # Define CSV columns (all metadata fields)
    fieldnames = [
        'name',
        'display_name_prefixed',
        'title',
        'description',
        'subscribers',
        'active_users',
        'created_utc',
        'subreddit_type',
        'over18',
        'quarantine',
        'top_posts_analyzed',
        'avg_score',
        'avg_comments',
        'total_engagement',
        'top_keywords_str',
        'primary_topics',
        'good_for',
        'url'
    ]
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        
        for entry in database:
            # Convert lists to comma-separated strings for CSV
            csv_entry = entry.copy()
            csv_entry['primary_topics'] = ', '.join(entry.get('primary_topics', []))
            csv_entry['good_for'] = ', '.join(entry.get('good_for', []))
            
            # Ensure description is present
            if 'description' not in csv_entry or not csv_entry['description']:
                csv_entry['description'] = entry.get('title', '')
            
            writer.writerow(csv_entry)
    
    print(f"✅ Exported to {filename}")
    print(f"   📊 Columns: {len(fieldnames)}")
    print(f"   📝 Rows: {len(database)}")
    
    # Show sample of what's in description column
    if database:
        sample_desc = database[0].get('description', 'NO DESCRIPTION')
        print(f"   📄 Sample description: {sample_desc[:80]}...")

def print_metadata_info():
    """Print information about what metadata is extracted"""
    print("\n" + "="*70)
    print("📋 METADATA ATTRIBUTES EXTRACTED")
    print("="*70)
    
    metadata_info = [
        ("BASIC INFO", [
            ("name", "Subreddit name (e.g., 'nutrition')"),
            ("display_name_prefixed", "Full name with prefix (e.g., 'r/nutrition')"),
            ("title", "Subreddit title/tagline"),
            ("description", "Public description (short)"),
            ("description_long", "Full description (first 200 chars)"),
            ("url", "Full Reddit URL"),
        ]),
        ("SIZE & ACTIVITY", [
            ("subscribers", "Total number of subscribers"),
            ("active_users", "Currently active users"),
            ("created_utc", "Unix timestamp of creation date"),
        ]),
        ("COMMUNITY TYPE", [
            ("subreddit_type", "Type: public, private, restricted, etc."),
            ("over18", "NSFW status (True/False)"),
            ("quarantine", "Quarantine status (True/False)"),
        ]),
        ("ENGAGEMENT METRICS", [
            ("top_posts_analyzed", "Number of top posts analyzed (50)"),
            ("avg_score", "Average upvotes on top posts"),
            ("avg_comments", "Average comments on top posts"),
            ("total_engagement", "Total upvotes + comments"),
        ]),
        ("CONTENT ANALYSIS", [
            ("keywords", "List of most common words in post titles"),
            ("top_keywords_str", "Top 10 keywords as comma-separated string"),
        ]),
        ("CATEGORIZATION (AI-Generated)", [
            ("primary_topics", "Main themes (e.g., 'nutrition, diet, food')"),
            ("good_for", "Health goals discussed (e.g., 'immunity, energy')"),
        ])
    ]
    
    for category, fields in metadata_info:
        print(f"\n{category}:")
        print("-" * 70)
        for field_name, description in fields:
            print(f"  • {field_name:25} {description}")
    
    print("\n" + "="*70)
    print()

def main():
    """Main function"""
    print("🏥 Subreddit Database Builder - Python Version\n")
    
    # Show what metadata will be extracted
    print_metadata_info()
    
    # List of health subreddits to fetch
    subreddits = [
        'AskDocs',
        'nutrition',
        'Health',
        'fitness',
        'loseit',
        'guthealth',
        'Supplements',
        'sleep',
        'mentalhealth',
        'SkincareAddiction',
        'Immunology',
        'diabetes',
        'HydroHomies',
        'Microbiome',
        'ibs',
        'VitaminD',
        'Nootropics',
        'HealthyFood',
        'WeightLossAdvice',
        'autoimmune'
    ]
    
    # Build database
    database = build_database(subreddits)
    
    # Display summary
    print("\n" + "="*60)
    print(f"📊 SUMMARY: Built database with {len(database)} subreddits")
    print("="*60)
    
    for entry in database:
        print(f"✅ r/{entry['name']} - {entry['subscribers']:,} subscribers - {entry.get('active_users', 0):,} active")
    
    # Export
    print("\n" + "="*60)
    export_to_csv(database)
    export_to_javascript(database)
    export_to_json(database)
    print("="*60)
    
    print("\n🎉 Done! Check the CSV file to see all metadata.\n")

if __name__ == '__main__':
    main()
