"""
IntelliCrowd — Cluster Engine
Groups detected heads/persons into clusters using DBSCAN.
Computes cluster metrics and convex hulls for visualization.
"""
import numpy as np
from sklearn.cluster import DBSCAN
from scipy.spatial import ConvexHull
import math
from typing import List, Tuple
from app.schemas import Point, ClusterInfo, BoundingBox

class ClusterEngine:
    """
    Groups detections into clusters using DBSCAN.
    Computes cluster metrics and convex hulls for visualization.
    """
    
    def __init__(self, eps: float = 0.08, min_samples: int = 3):
        # eps is in normalized coordinates (0.0 to 1.0)
        # 0.08 is roughly 100 pixels in a 1280 wide frame
        self.eps = eps
        self.min_samples = min_samples
        self._prev_clusters: List[ClusterInfo] = []
        self._next_id = 1

    def cluster_detections(self, boxes: List[BoundingBox]) -> List[ClusterInfo]:
        """
        Takes a list of bounding boxes and returns a list of identified clusters.
        """
        if len(boxes) < self.min_samples:
            return []

        # Extract centroids as points for clustering
        # Centroids are in normalized [0, 1] range
        points = np.array([[ (b.x1 + b.x2)/2, (b.y1 + b.y2)/2 ] for b in boxes])
        
        # Run DBSCAN clustering
        db = DBSCAN(eps=self.eps, min_samples=self.min_samples).fit(points)
        labels = db.labels_
        
        clusters = []
        unique_labels = set(labels)
        if -1 in unique_labels:
            unique_labels.remove(-1) # Noise label in DBSCAN

        for label in unique_labels:
            cluster_indices = np.where(labels == label)[0]
            cluster_points = points[cluster_indices]
            headcount = len(cluster_points)
            
            # Compute cluster centroid
            centroid_arr = np.mean(cluster_points, axis=0)
            centroid = Point(x=float(centroid_arr[0]), y=float(centroid_arr[1]))
            
            # Compute convex hull for the boundary
            hull_pts = []
            area = 0.001 # Minimum area to avoid div by zero
            
            if headcount >= 3:
                try:
                    hull = ConvexHull(cluster_points)
                    hull_pts = cluster_points[hull.vertices].tolist()
                    # In 2D, hull.volume is the area
                    area = max(0.001, hull.volume)
                except Exception:
                    # Fallback for degenerate cases (e.g., all points colinear)
                    hull_pts = cluster_points.tolist()
            else:
                hull_pts = cluster_points.tolist()

            # Density score (points per normalized area unit)
            density = headcount / area
            
            # Determine risk level based on headcount and density
            # These thresholds are heuristic for hackathon demos
            if headcount >= 12 or density > 500:
                risk = "critical"
            elif headcount >= 6 or density > 200:
                risk = "dense"
            else:
                risk = "safe"

            # Match with previous clusters for stable ID and smoothed headcount
            best_match = None
            best_dist = float('inf')
            for prev_c in self._prev_clusters:
                dist = math.hypot(prev_c.centroid.x - centroid.x, prev_c.centroid.y - centroid.y)
                if dist < 0.1 and dist < best_dist:  # 0.1 normalized distance threshold
                    best_match = prev_c
                    best_dist = dist

            if best_match:
                cluster_id = best_match.cluster_id
                # Exponential moving average for headcount smoothing
                smoothed_headcount = int(round(0.7 * best_match.headcount + 0.3 * headcount))
                # Quick catch-up if real headcount jumps significantly
                if abs(headcount - best_match.headcount) > 5:
                    smoothed_headcount = headcount
            else:
                cluster_id = self._next_id
                self._next_id += 1
                smoothed_headcount = headcount

            clusters.append(ClusterInfo(
                cluster_id=cluster_id,
                centroid=centroid,
                headcount=smoothed_headcount,
                density=float(density),
                convex_hull=hull_pts,
                risk_level=risk
            ))
            
        self._prev_clusters = clusters
        return clusters

    def filter_clusters_by_polygon(self, clusters: List[ClusterInfo], polygon: List[List[float]]) -> List[ClusterInfo]:
        """Filters clusters whose centroid is inside the given polygon."""
        from app.zone_engine import point_in_polygon
        
        filtered = []
        for c in clusters:
            if point_in_polygon(c.centroid.x, c.centroid.y, polygon):
                filtered.append(c)
        return filtered
