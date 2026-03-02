This repository is a mirror of the original [fit-tool](https://pypi.org/project/fit-tool/) project [source(bitbucket)](https://bitbucket.org/stagescycling/python_fit_tool.git/src).

The repository was created to apply minor bugfixes and add additional encoding workout samples.

## Setup
This version of fit tool can be added to your Python environment by installing from source [official instructions](https://packaging.python.org/en/latest/tutorials/installing-packages/#installing-from-a-local-src-tree).

Example Install:

```sh
# change dir to_location_of_this_readme
# the "." indicates install source from (here)
python -m pip install .
```

## Usage: Encoding a Workout
The supplied [write_workout_example.py](./examples/write_workout_example.py) mechanizes the examples found in the [FIT SDK Cookbook](https://developer.garmin.com/fit/cookbook/encoding-workout-files/).
For ease of use each example is within a function:
- `create_bike_tempo_workout`
- `create_run_800_repeats_workout`
- `create_custom_target_values`
- `create_pool_swim`

To create all examples:
```sh
cd examples/
python write_workout_example.py
```

which should produce an output message:
```sh
created: /c/your/path/to/repository/examples/Tempo_Bike_workout.fit
created: /c/your/path/to/repository/examples/Tempo_Bike_workout.csv
created: /c/your/path/to/repository/examples/800m_Repeats_workout.fit
created: /c/your/path/to/repository/examples/800m_Repeats_workout.csv
created: /c/your/path/to/repository/examples/Custom_Target_Values_workout.fit
created: /c/your/path/to/repository/examples/Custom_Target_Values_workout.csv
created: /c/your/path/to/repository/examples/Pool_Swim_workout.fit
created: /c/your/path/to/repository/examples/Pool_Swim_workout.csv
```

### Note
The generated workout files were individually checked by manually uploading the devices to a Garmin Forerunner 945.
1. connect watch to computer
2. using file explorer navigate to `/Forerunner 945/Internal Storage/GARMIN/NewFiles`
3. copy the fit file
4. disconnect watch and navigate to workout screen

One may also use the [FIT CSV Tool](https://developer.garmin.com/fit/fitcsvtool/) obtained from [SDK Download](https://developer.garmin.com/fit/download/).

## General Fit Tool README
[see: README_FIT_TOOL](./README_FIT_TOOL.md)