(function() {

  // the constructor.
  var MapManager = function(googleMap, initialScoreDomain) {
    self = this;
    map = googleMap;
    scoreDomain = initialScoreDomain;

    $(this).bind('lsoaDataRetrieved', function() {
      lsoaDataRetrieved = true;

      // TODO: this is where we're refresh the polygons on the map, later.

      // for now, just log out the lsoa data, and say we've done
      window.swirrl.log(lsoaData);

      $(self).trigger('finished');

    });

    // if there was an error getting any data, finish the request,
    // but don't remember the tiles ... so we can try again next time.
    $(this).bind('dataError', function() {
      // we only want to do this once - but getting boundaries or lsoa data (sparql) could raise this
      if (!errored) {
        errored = true;
        window.swirrl.log('data error!');
        prevTiles = []; // blank out the prevTiles
        $(this).trigger('finished'); // tell people we're done
      }
    });

  }

  // public API
  MapManager.prototype = {
    refresh: function() {
      $(this).trigger('started');
      errored = false;

      // clear these variables for this refresh
      if (map.getZoom() > minZoom) {
        $(this).trigger('zoomOK');

        var tiles = getTiles();
        deleteOldTilesData(tiles);
        newTiles = getNewTiles(tiles);

        prevTiles = tiles; // remember this set of tiles for comparison next time.

        // TODO: also get the boundary data.

        lsoaDataRetrieved = false;
        getLsoaData(newTiles);

      } else {
        $(this).trigger('zoomTooWide');
        $(this).trigger('finished');
      }
    }
  }

  // private variables
  var map
    , errored = false
    , prevTiles = []
    , scoreDomain
    , lsoaData = {} // map of tiles -> data
    , lsoaDataRetrieved = false
    , minZoom = 12
    , self;

  // private functions
  var tileInArray = function(tile, tileArray) {
    var inArray = false;
    for(var i=0; i < tileArray.length; i++) {
      t = tileArray[i];
      if (t[0][0] == tile[0][0] && t[0][1] == tile[0][1] &&
        t[1][0] == tile[1][0] && t[1][1] == tile[1][1]) {
        inArray = true;
        break;
      }
    }
    return inArray;
  };

  var deleteOldTilesData = function(tiles) {
    for(var i = 0; i < prevTiles.length; i++) {
      var prevTile = prevTiles[i];
      if (!tileInArray(prevTile, tiles)) {
        window.swirrl.log('tile data not needed', prevTile);

        // TODO: also delete boundary data, when we have some.

        delete lsoaData[prevTile];
      }
    }
  };

  var getNewTiles = function(tiles) {
    var newTiles = [];
    for(var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      if (!tileInArray(tile, prevTiles)) {
        newTiles.push(tile);
      }
    }
    window.swirrl.log('no of new tiles', newTiles.length);
    window.swirrl.log('new tiles', newTiles);
    return newTiles;
  };

  var setLsoaData = function(tile, lsoaNotation, data) {
     if (!lsoaData[tile]) {
      lsoaData[tile] = {};
    }
    lsoaData[tile][lsoaNotation] = data;
  };

  // work out the 0.1lat/long tiles that are convered by the current bounds
  var getTiles = function() {

    var divideLatByTen = function(latx10) {
      var lat = latx10.substring(0,2);
      if (latx10.length > 2) {
        lat += "." + latx10.substring(2);
      }
      return lat;
    };

    // for longs we have to account for the minus sign.
    var divideLongByTen = function(longx10){
      var lng = "";
      if (longx10[0] == "-") {
        // negative values
        if (longx10.length == 2){
          lng = "-0." + longx10[1];
        } else {
          lng = longx10.substring(0,2);
          if (longx10.length > 2) {
            lng += "." + longx10.substring(2);
          }
        }
      } else {
        // positive values
        if (longx10.length == 1){
          lng = "0." + longx10[0];
        } else {
          lng = longx10.substring(0,1);
          if (longx10.length > 1) {
            lng += "." + longx10.substring(1);
          }
        }
      }

      // edge case: convert -0.0 to 0.0
      if (lng == "-0.0") {
        lng = "0.0";
      }

      return lng;
    };

    var getTileBounds = function(lowerLatx10, lowerLongx10) {
      // make sure they're all strings.

      var upperLatx10 = (lowerLatx10 + 1).toString();
      var upperLongx10 = (lowerLongx10 + 1).toString();
      lowerLatx10 = lowerLatx10.toString();
      lowerLongx10 = lowerLongx10.toString();

      var lowerLat = divideLatByTen(lowerLatx10);
      var upperLat = divideLatByTen(upperLatx10);
      var lowerLong = divideLongByTen(lowerLongx10);
      var upperLong = divideLongByTen(upperLongx10);

      var tileBounds = [ [lowerLat, lowerLong], [upperLat, upperLong] ];
      window.swirrl.log(tileBounds);
      return tileBounds;
    };

    // work out the 0.1lat/long tiles that are convered by the current bounds
    var northEast = map.getBounds().getNorthEast();
    var southWest = map.getBounds().getSouthWest();

    // these are the outer bounds, rounded to 0.1 extremities.
    // we work with everything scaled up to 10 times the size to avoid floating point probs.
    var lowerLatx10 = Math.floor(southWest.lat() * 10);
    var upperLatx10 = Math.floor((northEast.lat()+0.1) * 10);
    var lowerLongx10 = Math.floor(southWest.lng() * 10);
    var upperLongx10 = Math.floor((northEast.lng()+0.1) * 10);

    var tiles = [];
    var lat = lowerLatx10;

    while (lat <= (upperLatx10-1)) {
      var lng = lowerLongx10;
      while (lng <= (upperLongx10 -1)) {
        tiles.push(getTileBounds(lat,lng));
        lng += 1;
      }
      lat += 1;
    }

    return tiles;
  };

  // get the LSOA data from the database.
  var getLsoaData = function(tiles) {

    // define this inside this closure - it's not useful outside the scope of this func
    var buildSparql = function(tile) {

      var lowerLat = tile[0][0];
      var lowerLong = tile[0][1];
      var upperLat = tile[1][0];
      var upperLong = tile[1][1];

      var sparql = "PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#> " +
      "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> " +
      "SELECT ?lsoa ?notation ?label ?lat ?long ?score" +
      " WHERE { " +
      "  GRAPH <http://opendatacommunities.org/id/graph/geography/lsoa> { " +
      "    ?lsoa a <http://opendatacommunities.org/def/geography#LSOA> . " +
      "    ?lsoa geo:lat ?lat . " +
      "    ?lsoa geo:long ?long . " +
      "    ?lsoa <http://www.w3.org/2004/02/skos/core#notation> ?notation . " +
      "    ?lsoa rdfs:label ?label . " +
      "  } " +
      "  GRAPH <http://opendatacommunities.org/id/graph/IMD/2010/" + scoreDomain + "> {  " +
      "    ?obs <http://purl.org/linked-data/sdmx/2009/dimension#refArea> ?lsoa . " +
      "    ?obs <http://opendatacommunities.org/def/IMD#" + scoreDomain + "> ?score . " +
      "  } " +
      "  FILTER ( ?lat >= " + lowerLat + " && " +
      "    ?lat < " + upperLat + " && " +
      "    ?long >= " + lowerLong + " && " +
      "    ?long < " + upperLong + " ) . " +
      "}";
      return sparql;

    };

    var noOfTiles = tiles.length;

    // nothing to do.
    if(noOfTiles == 0) {
      $(self).trigger('lsoaDataRetrieved');
    }

    var tilesRetrieved = 0;

    var page = 1;
    var pageSize = 1000;

    var callAjaxSparqlPaging = function(sparql, tile) {
      var queryUrl = "http://opendatacommunities.org/sparql.json?_page=" + page.toString() + "&_per_page=" + pageSize.toString() + "&query=" + encodeURIComponent(sparql);
      window.swirrl.log('about to call', queryUrl);
      $.ajax(
        queryUrl,
        {
          success: function(data, textStatus, jqXHR) {
            var pageOfData = data.results.bindings;
            $.each(pageOfData, function(idx, el){
              var data = {
                uri: el.lsoa['value'],
                label: el.label['value'],
                lat: parseFloat(el.lat['value']),
                lng: parseFloat(el['long']['value']),
                score: parseFloat(el.score['value'])
              }
              var lsoaNotation = el.notation['value'];
              setLsoaData(tile, lsoaNotation, data);
            });

            if (pageOfData.length == pageSize) {
              // this page was full. There might be more.
              page += 1;
              callAjaxSparqlPaging(sparql);
            } else {
              // no more pages.
              tilesRetrieved+=1;
              if (tilesRetrieved == tiles.length) {
                // we've got all the lsoaData.
                $(self).trigger('lsoaDataRetrieved');
              }
            }
          },
          error: function(jqXHR, textStatus, errorThrown) {
            window.swirrl.log("SPARQL Fail: " + errorThrown + " " + textStatus);
            $(self).trigger('dataError');
          },
          dataType: 'json',
          timeout: 10000 // timeout after a short time.
        }
      );
    };

    // for each tile, get all the pages of data.
    $.each(tiles, function(i, tile){
      var sparql = buildSparql(tile);
      callAjaxSparqlPaging(sparql, tile);
    });
  };

  // add the MapManager to the swirrl namespace.
  window.swirrl.MapManager = MapManager;
})();