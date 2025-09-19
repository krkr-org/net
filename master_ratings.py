#!/usr/bin/env python3
"""
Master Ratings System
Comprehensive rating fetcher combining all data sources:
- Bulk search API (60 providers max)
- Direct listing endpoints (unlimited)
- Local JSON files from tree endpoints
Creates unified ratings.json with maximum provider coverage
"""

import json
import math
import os
import requests
import time
from datetime import datetime
from typing import Dict, List, Optional

class MasterRatingsSystem:
    def __init__(self):
        self.base_url = "https://api.productreview.com.au"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })

        # Tree endpoint JSON file mapping
        self.tree_json_mapping = {
            'agl-nbn.json': {'name': 'AGL TELECOMMUNICATIONS', 'id': 10},
            'telstra-home-internet.json': {'name': 'TELSTRA', 'id': 133},
            'yes-optus-broadband.json': {'name': 'OPTUS', 'id': 110},
            'southern-phone-broadband.json': {'name': 'SOUTHERN PHONE', 'id': 121},
            'carbon-comms.json': {'name': 'CARBON COMMS', 'id': 37},
            'sumo-internet.json': {'name': 'SUMO', 'id': 125},
            'yomojo.json': {'name': 'YOMOJO', 'id': 162},
            'ant.json': {'name': 'ANT', 'id': 14},
            'c-mobile.json': {'name': 'CMOBILE', 'id': 42},
            'escapenet.json': {'name': 'ESCAPENET', 'id': 52},
            'telsim.json': {'name': 'TELSIM', 'id': 155},
            'activ8me.json': {'name': 'ACTIV8ME', 'id': 6},
            'maxo-telecommunications.json': {'name': 'MAXO TELECOMMUNICATIONS', 'id': 158}
        }

        # Direct listing endpoints for missing providers
        self.direct_listings = {
            'dodo': {'name': 'DODO', 'id': 48},
            'flip': {'name': 'FLIP', 'id': 57},
            'exetel': {'name': 'EXETEL', 'id': 53},
            'skymesh': {'name': 'SKYMESH', 'id': 120},
            'iinet': {'name': 'IINET', 'id': 72},
            'iprimus-1300-fibre-1': {'name': 'IPRIMUS - 1300 FIBRE 1', 'id': 77}
        }

    def calculate_percentage_ratings(self, rating_distribution: List[int]) -> Optional[Dict]:
        """Convert star rating distribution to percentage ratings

        Matches ProductReview.com.au display logic using floor-based calculation
        """
        if not rating_distribution or len(rating_distribution) != 5:
            return None

        total = sum(rating_distribution)
        if total == 0:
            return None

        # rating_distribution = [1-star, 2-star, 3-star, 4-star, 5-star]
        negative_count = rating_distribution[0] + rating_distribution[1]  # 1-2 star
        neutral_count = rating_distribution[2]                           # 3 star
        positive_count = rating_distribution[3] + rating_distribution[4] # 4-5 star

        # Calculate exact percentages
        negative_exact = (negative_count / total) * 100
        neutral_exact = (neutral_count / total) * 100
        positive_exact = (positive_count / total) * 100

        # Start with floor values
        negative_floor = math.floor(negative_exact)
        neutral_floor = math.floor(neutral_exact)
        positive_floor = math.floor(positive_exact)

        # Calculate remainder to distribute
        remainder = 100 - (negative_floor + neutral_floor + positive_floor)

        # Find categories with largest fractional parts for remainder distribution
        fractions = [
            (negative_exact - negative_floor, 'negative'),
            (neutral_exact - neutral_floor, 'neutral'),
            (positive_exact - positive_floor, 'positive')
        ]
        fractions.sort(reverse=True)  # Largest fraction first

        # Start with floor values
        final_negative = negative_floor
        final_neutral = neutral_floor
        final_positive = positive_floor

        # Distribute remainder to categories with largest fractional parts
        for i in range(remainder):
            if i < len(fractions):
                category = fractions[i][1]
                if category == 'negative':
                    final_negative += 1
                elif category == 'neutral':
                    final_neutral += 1
                else:
                    final_positive += 1

        return {
            "positive_percent": final_positive,
            "negative_percent": final_negative,
            "neutral_percent": final_neutral,
            "total_reviews": total
        }

    def fetch_bulk_ratings(self) -> Dict:
        """Fetch ratings using bulk search API (limited to 60 providers)"""
        print("🔍 Fetching bulk ratings from category search...")

        try:
            response = self.session.get(
                f"{self.base_url}/api/search/au/listings",
                params={
                    'categoryId': 'internet-service-providers',
                    'sortBy': 'relevance',
                    'page': 1,
                    'perPage': 60
                },
                timeout=30
            )

            if response.status_code == 429:
                print("⚠️ Rate limited, waiting 10 seconds...")
                time.sleep(10)
                return {}

            response.raise_for_status()
            data = response.json()

            listings = data.get('data', {}).get('collection', {}).get('items', [])
            print(f"📊 Found {len(listings)} providers from bulk search")

            bulk_ratings = {}
            for listing in listings:
                if 'statistics' not in listing:
                    continue

                stats = listing['statistics']
                rating_dist = stats.get('ratingDistribution', [])

                if len(rating_dist) != 5:
                    continue

                percentages = self.calculate_percentage_ratings(rating_dist)
                if not percentages:
                    continue

                # Find provider ID by matching name
                provider_id = self.find_provider_id(listing['name'])
                if not provider_id:
                    continue

                bulk_ratings[str(provider_id)] = {
                    "name": listing['name'].upper(),
                    "api_name": listing['name'],
                    "positive_percent": percentages['positive_percent'],
                    "negative_percent": percentages['negative_percent'],
                    "neutral_percent": percentages['neutral_percent'],
                    "total_reviews": percentages['total_reviews'],
                    "average_rating": round(stats.get('rating', 0), 1),
                    "last_updated": datetime.now().isoformat(),
                    "capture_method": "bulk_search_api"
                }

            return bulk_ratings

        except Exception as e:
            print(f"❌ Error fetching bulk ratings: {e}")
            return {}

    def fetch_direct_listing_ratings(self, slug: str, provider_info: Dict) -> Optional[Dict]:
        """Fetch ratings for a specific provider using direct listing endpoint"""
        print(f"📡 Fetching direct ratings for {provider_info['name']}...")

        try:
            response = self.session.get(
                f"{self.base_url}/api/au/listings/{slug}/reviews",
                params={
                    'page': 1,
                    'perPage': 100,
                    'sortBy': 'newest'
                },
                timeout=30
            )

            if response.status_code == 429:
                print(f"⚠️ Rate limited for {slug}, waiting 10 seconds...")
                time.sleep(10)
                return None

            if response.status_code == 404:
                print(f"❌ Provider not found: {slug}")
                return None

            response.raise_for_status()
            data = response.json()

            # Extract review statistics
            reviews_data = data.get('data', {})
            if isinstance(reviews_data, dict):
                total_reviews = reviews_data.get('totalCount', 0)

                # Get rating distribution from first page
                all_reviews = reviews_data.get('collection', {}).get('items', [])

                if not all_reviews:
                    return None

                # Calculate rating distribution from reviews
                rating_counts = [0, 0, 0, 0, 0]  # 1-star to 5-star
                for review in all_reviews:
                    rating = review.get('rating', 0)
                    if 1 <= rating <= 5:
                        rating_counts[rating - 1] += 1

                # Scale up to total if we have a sample
                if total_reviews > len(all_reviews) and len(all_reviews) > 0:
                    scale_factor = total_reviews / len(all_reviews)
                    rating_counts = [int(count * scale_factor) for count in rating_counts]

                percentages = self.calculate_percentage_ratings(rating_counts)
                if not percentages:
                    return None

                # Calculate average rating
                total_rating_points = sum((i + 1) * count for i, count in enumerate(rating_counts))
                average_rating = total_rating_points / sum(rating_counts) if sum(rating_counts) > 0 else 0

                return {
                    "name": provider_info['name'],
                    "api_name": provider_info['name'],
                    "positive_percent": percentages['positive_percent'],
                    "negative_percent": percentages['negative_percent'],
                    "neutral_percent": percentages['neutral_percent'],
                    "total_reviews": sum(rating_counts),
                    "average_rating": round(average_rating, 1),
                    "last_updated": datetime.now().isoformat(),
                    "capture_method": "direct_listing_api",
                    "raw_distribution": rating_counts
                }

        except Exception as e:
            print(f"❌ Error fetching {slug}: {e}")
            return None

    def process_tree_json_files(self) -> Dict:
        """Process local JSON files from tree endpoints"""
        print("📁 Processing tree endpoint JSON files...")

        json_ratings = {}
        if not os.path.exists('json'):
            print("⚠️ json/ directory not found")
            return json_ratings

        for filename, provider_info in self.tree_json_mapping.items():
            filepath = f"json/{filename}"

            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)

                # Extract statistics from root level
                statistics = data.get('statistics', {})
                if not statistics:
                    print(f"⚠️ No statistics found in {filename}")
                    continue

                rating_distribution = statistics.get('ratingDistribution', [])
                total_reviews = statistics.get('numberOfReviews', 0)
                average_rating = statistics.get('rating', 0)

                print(f"📊 {provider_info['name']}: {total_reviews} reviews, avg {average_rating:.1f}")

                if not rating_distribution or len(rating_distribution) != 5:
                    print(f"❌ Invalid rating distribution for {provider_info['name']}")
                    continue

                if total_reviews == 0:
                    print(f"❌ No reviews for {provider_info['name']}")
                    continue

                # Calculate percentage ratings
                percentage_ratings = self.calculate_percentage_ratings(rating_distribution)
                if not percentage_ratings:
                    print(f"❌ Failed to calculate percentages for {provider_info['name']}")
                    continue

                provider_id = str(provider_info['id'])
                json_ratings[provider_id] = {
                    "name": provider_info['name'],
                    "api_name": provider_info['name'],
                    "positive_percent": percentage_ratings['positive_percent'],
                    "negative_percent": percentage_ratings['negative_percent'],
                    "neutral_percent": percentage_ratings['neutral_percent'],
                    "total_reviews": total_reviews,
                    "average_rating": round(average_rating, 1),
                    "last_updated": datetime.now().isoformat(),
                    "capture_method": "tree_endpoint_json",
                    "raw_distribution": rating_distribution
                }

                print(f"✅ {provider_info['name']}: {percentage_ratings['positive_percent']}% positive")

            except FileNotFoundError:
                print(f"❌ File not found: {filepath}")
                continue
            except json.JSONDecodeError as e:
                print(f"❌ JSON parsing error in {filename}: {e}")
                continue
            except Exception as e:
                print(f"❌ Error processing {filename}: {e}")
                continue

        return json_ratings

    def fetch_direct_listings(self) -> Dict:
        """Fetch ratings for providers using direct listing endpoints"""
        print("🎯 Fetching direct listing ratings...")

        direct_ratings = {}
        for slug, provider_info in self.direct_listings.items():
            rating_data = self.fetch_direct_listing_ratings(slug, provider_info)
            if rating_data:
                provider_id = str(provider_info['id'])
                direct_ratings[provider_id] = rating_data
                print(f"✅ {provider_info['name']}: {rating_data['positive_percent']}% positive")

            # Rate limiting
            time.sleep(2)

        return direct_ratings

    def find_provider_id(self, provider_name: str) -> Optional[int]:
        """Find provider ID by matching name with providers.json"""
        try:
            with open('data/providers.json', 'r') as f:
                providers_data = json.load(f)

            providers = providers_data.get('data', [])
            for provider in providers:
                if provider['name'].lower() in provider_name.lower() or provider_name.lower() in provider['name'].lower():
                    return provider['id']

            return None

        except Exception as e:
            print(f"⚠️ Error reading providers.json: {e}")
            return None

    def load_existing_ratings(self) -> Dict:
        """Load existing ratings.json file"""
        try:
            with open('data/ratings.json', 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print("⚠️ No existing ratings.json found, creating new one")
            return {
                "metadata": {
                    "generated_at": datetime.now().isoformat(),
                    "total_providers_matched": 0,
                    "generator": "Master Rating System",
                    "version": "1.0"
                },
                "ratings": {}
            }
        except json.JSONDecodeError as e:
            print(f"❌ Error parsing existing ratings.json: {e}")
            return None

    def create_master_ratings(self) -> bool:
        """Create comprehensive ratings file using all data sources"""
        print("🚀 Master Ratings System - Comprehensive Rating Collection")
        print("   Combining bulk search, direct listings, and JSON tree data...")

        # Load existing ratings as base
        ratings_data = self.load_existing_ratings()
        if ratings_data is None:
            print("❌ Failed to load existing ratings")
            return False

        all_new_ratings = {}

        # 1. Fetch bulk ratings (60 providers max)
        print("\n" + "="*60)
        bulk_ratings = self.fetch_bulk_ratings()
        all_new_ratings.update(bulk_ratings)
        print(f"✅ Bulk search: {len(bulk_ratings)} providers")

        # 2. Process tree endpoint JSON files
        print("\n" + "="*60)
        json_ratings = self.process_tree_json_files()
        all_new_ratings.update(json_ratings)
        print(f"✅ Tree JSON files: {len(json_ratings)} providers")

        # 3. Fetch direct listings for remaining providers
        print("\n" + "="*60)
        direct_ratings = self.fetch_direct_listings()
        all_new_ratings.update(direct_ratings)
        print(f"✅ Direct listings: {len(direct_ratings)} providers")

        if not all_new_ratings:
            print("\n❌ No ratings collected from any source")
            return False

        # Merge all ratings (new data takes priority)
        print(f"\n🔄 Merging {len(all_new_ratings)} total ratings...")

        for provider_id, new_rating in all_new_ratings.items():
            if provider_id in ratings_data['ratings']:
                print(f"   🔄 Updating {new_rating['name']} ({new_rating['capture_method']})")
            else:
                print(f"   ➕ Adding {new_rating['name']} ({new_rating['capture_method']})")
            ratings_data['ratings'][provider_id] = new_rating

        # Update metadata
        ratings_data['metadata']['generated_at'] = datetime.now().isoformat()
        ratings_data['metadata']['total_providers_matched'] = len(ratings_data['ratings'])
        ratings_data['metadata']['generator'] = "Master Rating System (All Sources)"

        # Save unified ratings
        try:
            with open('data/ratings.json', 'w') as f:
                json.dump(ratings_data, f, indent=2)

            print(f"\n💾 Master ratings.json created successfully!")
            print(f"📊 Final statistics:")
            print(f"   📈 Total providers: {len(ratings_data['ratings'])}")
            print(f"   🔍 Bulk search: {len(bulk_ratings)}")
            print(f"   🌳 Tree endpoints: {len(json_ratings)}")
            print(f"   🎯 Direct listings: {len(direct_ratings)}")

            return True

        except Exception as e:
            print(f"\n❌ Failed to save master ratings: {e}")
            return False

    def show_summary(self):
        """Show comprehensive summary of all ratings"""
        try:
            with open('data/ratings.json', 'r') as f:
                data = json.load(f)

            print(f"\n📋 Master Ratings Summary:")
            print(f"   Generated: {data['metadata']['generated_at']}")
            print(f"   Total providers: {data['metadata']['total_providers_matched']}")

            # Categorize by capture method
            methods = {}
            for provider_id, rating in data['ratings'].items():
                method = rating.get('capture_method', 'unknown')
                if method not in methods:
                    methods[method] = []
                methods[method].append(rating)

            print(f"\n📊 Breakdown by capture method:")
            for method, providers in methods.items():
                print(f"   {method}: {len(providers)} providers")

                # Show top rated providers for each method
                sorted_providers = sorted(providers, key=lambda x: x['positive_percent'], reverse=True)
                for provider in sorted_providers[:3]:  # Top 3
                    print(f"     • {provider['name']}: {provider['positive_percent']}% positive ({provider['total_reviews']} reviews)")

        except Exception as e:
            print(f"❌ Error showing summary: {e}")

def main():
    print("🚀 Master Ratings System")
    print("   Comprehensive rating collection from all sources")

    system = MasterRatingsSystem()

    # Create master ratings
    success = system.create_master_ratings()

    if success:
        system.show_summary()
        print("\n🎉 Master ratings file created successfully!")
        print("💡 All rating sources have been integrated")
    else:
        print("\n❌ Failed to create master ratings file")

if __name__ == "__main__":
    main()