#!/usr/bin/env python3
"""
WebSearch Tool - Tavily API Integration
Ported from JarvisX-Cowork
"""

import argparse
import json
import os
import sys
import requests
from datetime import datetime

# Try to import tavily
try:
    from tavily import TavilyClient
except ImportError:
    print(json.dumps({
        "error": "tavily-python package not installed. Run: pip install tavily-python",
        "is_error": True
    }, ensure_ascii=False))
    sys.exit(1)


def search_general(client, query, max_results, search_depth, include_domains, exclude_domains):
    try:
        response = client.search(
            query=query,
            max_results=max_results,
            search_depth=search_depth,
            include_domains=include_domains if include_domains else [],
            exclude_domains=exclude_domains if exclude_domains else [],
            include_answer=True,
            include_images=False
        )
        return response
    except Exception as e:
        raise Exception(f"General search failed: {str(e)}")


def search_news(client, query, max_results):
    try:
        response = client.search(
            query=query,
            max_results=max_results,
            topic="news",
            include_answer=True
        )
        return response
    except Exception as e:
        raise Exception(f"News search failed: {str(e)}")


def search_images(client, query, max_results):
    try:
        response = client.search(
            query=query,
            max_results=max_results,
            include_images=True,
            include_answer=False
        )
        images = response.get("images", [])
        return {"images": images}
    except Exception as e:
        raise Exception(f"Image search failed: {str(e)}")


def format_results(results):
    formatted = []
    for item in results:
        formatted.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "content": item.get("content", ""),
            "score": item.get("score", 0),
            "published_date": item.get("published_date", "")
        })
    return formatted


def main():
    parser = argparse.ArgumentParser(description='WebSearch Tool using Tavily API')
    parser.add_argument('--api_key', required=True, help='Tavily API key')
    parser.add_argument('--query', required=True, help='Search query')
    parser.add_argument('--search_type', default='general',
                        choices=['general', 'news', 'images'],
                        help='Type of search to perform')
    parser.add_argument('--max_results', type=int, default=5,
                        help='Maximum number of results (1-10)')
    parser.add_argument('--search_depth', default='basic',
                        choices=['basic', 'advanced'],
                        help='Search depth')

    args = parser.parse_args()
    max_results = max(1, min(10, args.max_results))

    result = {
        "query": args.query,
        "search_type": args.search_type,
        "timestamp": datetime.now().isoformat(),
        "results": [],
        "images": [],
        "answer": None
    }

    try:
        client = TavilyClient(api_key=args.api_key)

        if args.search_type == 'general':
            response = search_general(client, args.query, max_results, args.search_depth, [], [])
            result["answer"] = response.get("answer")
            result["results"] = format_results(response.get("results", []))

        elif args.search_type == 'news':
            response = search_news(client, args.query, max_results)
            result["answer"] = response.get("answer")
            result["results"] = format_results(response.get("results", []))

        elif args.search_type == 'images':
            response = search_images(client, args.query, max_results)
            images = response.get("images", [])
            for img_url in images:
                result["images"].append({"url": img_url})

        # Print JSON to stdout for Node.js to capture
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "is_error": True
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
